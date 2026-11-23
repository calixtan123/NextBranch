import Foundation

/// Requests the existing departures API only when WidgetKit wakes the extension or the user taps refresh.
private actor DepartureRefresh {
  static let shared = DepartureRefresh()
  private static let automaticInterval: TimeInterval = 15 * 60
  private static let manualInterval: TimeInterval = 30
  private var inFlight: Task<Void, Never>?

  func update(_ configuration: SavedConfiguration) async {
    guard let origin = configuration.origin else { return }
    let pages = configuration.pages.filter { $0.review != true }
    let stations = Set(pages.map { $0.selection.stationId })
    guard !stations.isEmpty else { return }
    if let inFlight {
      await inFlight.value
      return
    }
    let now = Date.now
    let requested = WidgetPreferences.defaults?.bool(forKey: WidgetPreferences.refreshKey) ?? false
    WidgetPreferences.defaults?.removeObject(forKey: WidgetPreferences.refreshKey)
    let cache = RefreshCache.load(origin)
    let newStations = !stations.isSubset(of: Set(cache.stations))
    let readsDue = requested || newStations || now >= cache.nextAutomatic
    let allFresh = pages.allSatisfy { ($0.board.expiresAt ?? 0) > milliseconds(now) }
    guard readsDue, requested || !allFresh, now >= cache.nextAllowed else { return }

    let task = Task {
      let result = await Self.fetch(stations.sorted(), origin: origin, start: now)
      result.save()
    }
    inFlight = task
    await task.value
    inFlight = nil
  }

  static func nextWake(_ configuration: SavedConfiguration, now: Date) -> Date {
    guard let origin = configuration.origin else { return now.addingTimeInterval(automaticInterval) }
    let cache = RefreshCache.load(origin)
    // WidgetKit can coalesce or delay requests. Avoid asking it to wake on an expired deadline.
    return max(now.addingTimeInterval(5 * 60), cache.nextAutomatic, cache.nextAllowed)
  }

  private static func fetch(_ stations: [String], origin: URL, start: Date) async -> RefreshCache {
    let config = URLSessionConfiguration.ephemeral
    config.requestCachePolicy = .reloadIgnoringLocalCacheData
    config.timeoutIntervalForRequest = 8
    config.timeoutIntervalForResource = 10
    let session = URLSession(configuration: config, delegate: NoRedirects(), delegateQueue: nil)
    defer { session.finishTasksAndInvalidate() }
    let completed = await withTaskGroup(of: StationFetch.self, returning: [StationFetch].self) { group in
      for station in stations {
        group.addTask { await read(station, origin: origin, session: session) }
      }
      var results: [StationFetch] = []
      for await result in group { results.append(result) }
      return results
    }
    let now = Date.now
    let retry = completed.compactMap(\.retryAt).max() ?? now
    return RefreshCache(
      origin: origin, stations: stations, responses: completed.compactMap(\.response),
      nextAutomatic: start.addingTimeInterval(automaticInterval),
      nextAllowed: max(start.addingTimeInterval(manualInterval), retry)
    )
  }

  private static func read(_ station: String, origin: URL, session: URLSession) async -> StationFetch {
    var endpoint = URLComponents(url: origin, resolvingAgainstBaseURL: false)
    endpoint?.path = "/api/departures"
    endpoint?.queryItems = [URLQueryItem(name: "station", value: station)]
    guard let url = endpoint?.url else { return StationFetch() }
    var request = URLRequest(url: url)
    request.setValue("application/json", forHTTPHeaderField: "Accept")
    request.setValue("no-store", forHTTPHeaderField: "Cache-Control")
    let clock = ContinuousClock()
    let start = clock.now
    do {
      let (body, response) = try await session.data(for: request)
      guard let http = response as? HTTPURLResponse else { return StationFetch() }
      let now = Date.now
      if http.statusCode == 429 {
        let header = http.value(forHTTPHeaderField: "Retry-After") ?? ""
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        let seconds = Double(header).flatMap { $0.isFinite && $0 > 0 ? $0 : nil }
        let retry = seconds.map { now.addingTimeInterval($0) } ?? formatter.date(from: header)
        return StationFetch(retryAt: max(retry ?? now, now.addingTimeInterval(manualInterval)))
      }
      guard http.statusCode == 200, body.count <= 1_048_576 else { return StationFetch() }
      let duration = start.duration(to: clock.now).components
      return StationFetch(response: CachedDeparture(
        station: station, body: body, receivedAt: milliseconds(now),
        duration: Double(duration.seconds) * 1_000 + Double(duration.attoseconds) / 1e15
      ))
    } catch {
      return StationFetch()
    }
  }
}

private struct StationFetch: Sendable {
  var response: CachedDeparture?
  var retryAt: Date?
}

private struct CachedDeparture: Codable, Sendable {
  var station: String
  var body: Data
  var receivedAt: Double
  var duration: Double

  var projectionInput: [String: Any]? {
    guard let payload = try? JSONSerialization.jsonObject(with: body) else { return nil }
    return ["body": payload, "receivedAt": receivedAt, "duration": duration]
  }
}

/// Persist the request throttle and original receipt time across WidgetKit process launches.
private struct RefreshCache: Codable, Sendable {
  var origin: URL
  var stations: [String]
  var responses: [CachedDeparture]
  var nextAutomatic: Date
  var nextAllowed: Date

  static func load(_ origin: URL) -> Self {
    if let data = WidgetPreferences.defaults?.data(forKey: WidgetPreferences.cacheKey),
       let cache = try? JSONDecoder().decode(Self.self, from: data),
       cache.origin == origin { return cache }
    return Self(origin: origin, stations: [], responses: [], nextAutomatic: .distantPast, nextAllowed: .distantPast)
  }

  func save() {
    if let data = try? JSONEncoder().encode(self) {
      WidgetPreferences.defaults?.set(data, forKey: WidgetPreferences.cacheKey)
    }
  }
}

/// Keep station requests on the app's configured API host.
private final class NoRedirects: NSObject, URLSessionTaskDelegate {
  func urlSession(
    _ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse,
    newRequest request: URLRequest, completionHandler: @escaping @Sendable (URLRequest?) -> Void
  ) {
    completionHandler(nil)
  }
}
