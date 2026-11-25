import AppIntents
import Foundation
import JavaScriptCore
import SwiftUI
import WidgetKit
internal import ExpoWidgets

private enum WidgetPreferences {
  static let kind = "SavedPlatforms"
  static let pageKey = "nextbranch-widget-page"
  static let refreshKey = "nextbranch-widget-refresh-requested"
  static let cacheKey = "nextbranch-widget-departures-cache"
  static let plansURL = URL(string: "nextbranch://plans")

  static func allowsAccess(_ props: [String: Any]?) -> Bool {
    #if NEXTBRANCH_MOCK_PLANS
    return props?["mockPlan"] as? String == "pro"
    #else
    return true
    #endif
  }

  static var allowsPublishedAccess: Bool {
    #if NEXTBRANCH_MOCK_PLANS
    // Read the same snapshot as Expo's provider for intents and late rendering.
    guard WidgetsStorage.appGroupIdentifier != nil,
          let entry = WidgetsStorage.getArray(forKey: "__expo_widgets_\(kind)_timeline")?.first as? [String: Any],
          entry["timestamp"] is Int else { return false }
    return allowsAccess(entry["props"] as? [String: Any])
    #else
    return true
    #endif
  }
  static var defaults: UserDefaults? {
    guard let group = WidgetsStorage.appGroupIdentifier else { return nil }
    return UserDefaults(suiteName: group)
  }
}

private func milliseconds(_ date: Date) -> Double { date.timeIntervalSince1970 * 1_000 }

/// Loads the same departure projection used by both the timeline and the refresh cache.
private func widgetProjection() -> JSValue? {
  guard let data = Data(base64Encoded: "__WIDGET_PROJECTION__"),
        let script = String(data: data, encoding: .utf8), let context = JSContext()
  else { return nil }
  context.evaluateScript(script)
  return context.objectForKeyedSubscript("NextBranchWidgetProjection")
}

/// The selected departure board projected by the shared app code.
private struct SavedBoard: Decodable {
  struct Palette: Decodable {
    var background: String
    var dot: String
    var frame: String
    var rule: String
    var text: String
    var step: Double
  }

  struct Row: Decodable {
    var identity: String
    var countdown: String?
    var destinationMatrix: [[String]]?
    var countdownMatrix: [String]?
  }

  struct LineMarker: Decodable {
    var name: String
    var colour: String
  }

  var station: String
  var platform: String?
  var lines: String?
  var lineMarkers: [LineMarker]?
  var rows: [Row]
  var message: String?
  var style: String?
  var colors: Palette?
  var interfaceTheme: String?
  var expiresAt: Double?
  var staleAt: Double?
  var ordinalMatrices: [[String]]?

  static func decode(_ value: Any?) -> Self? {
    guard let value, let data = try? JSONSerialization.data(withJSONObject: value, options: .fragmentsAllowed) else { return nil }
    return try? JSONDecoder().decode(Self.self, from: data)
  }
}

/// Decode the saved configuration for paging and background refresh.
private struct SavedConfiguration: Decodable, Sendable {
  struct Page: Decodable, Sendable {
    struct Selection: Decodable, Sendable { var stationId: String }
    struct Board: Decodable, Sendable {
      var interfaceTheme: String?
      var expiresAt: Double?
      var staleAt: Double?
    }
    var key: String
    var review: Bool?
    var selection: Selection
    var board: Board
  }

  var pages: [Page]
  var apiOrigin: String?

  var origin: URL? {
    guard let apiOrigin, let parts = URLComponents(string: apiOrigin),
          let host = parts.host, !host.isEmpty, parts.user == nil, parts.password == nil,
          parts.query == nil, parts.fragment == nil, parts.path.isEmpty || parts.path == "/"
    else { return nil }
    if parts.scheme == "https" { return parts.url }
    #if targetEnvironment(simulator)
    if parts.scheme == "http", ["localhost", "127.0.0.1", "[::1]"].contains(host) { return parts.url }
    #endif
    return nil
  }
}

@available(iOS 17.0, *)
struct ChoosePlatform: AppIntent {
  static var title: LocalizedStringResource = "Show saved platform"
  static var isDiscoverable: Bool = false
  @Parameter(title: "Platform") var key: String

  init() {}
  init(key: String) { self.key = key }

  func perform() async throws -> some IntentResult {
    guard WidgetPreferences.allowsPublishedAccess else { return .result() }
    WidgetPreferences.defaults?.set(key, forKey: WidgetPreferences.pageKey)
    WidgetCenter.shared.reloadTimelines(ofKind: WidgetPreferences.kind)
    return .result()
  }
}

@available(iOS 17.0, *)
struct RefreshDepartures: AppIntent {
  static var title: LocalizedStringResource = "Refresh departures"
  static var isDiscoverable: Bool = false

  func perform() async throws -> some IntentResult {
    guard WidgetPreferences.allowsPublishedAccess else { return .result() }
    WidgetPreferences.defaults?.set(true, forKey: WidgetPreferences.refreshKey)
    return .result()
  }
}

private struct SavedEntry: TimelineEntry {
  var date: Date
  var board: SavedBoard?
  var page = 0
  var count = 0
  var previous: String?
  var next: String?
  var canRefresh = false
  var locked = false
}

/// Reuses the public Expo provider to read the snapshot. This provider owns the visible timeline.
private struct SavedProvider: TimelineProvider {
  private let published = WidgetsTimelineProvider(name: WidgetPreferences.kind)

  func placeholder(in context: Context) -> SavedEntry {
    SavedEntry(date: .now, locked: !WidgetPreferences.allowsPublishedAccess)
  }

  func getSnapshot(in context: Context, completion: @escaping @Sendable (SavedEntry) -> Void) {
    published.getSnapshot(in: context) { result in
      completion(Self.entries(from: result.props, now: .now).first ?? placeholder(in: context))
    }
  }

  func getTimeline(in context: Context, completion: @escaping @Sendable (Timeline<SavedEntry>) -> Void) {
    published.getSnapshot(in: context) { result in
      Task {
        if WidgetPreferences.allowsAccess(result.props), let configuration = Self.configuration(from: result.props) {
          let pages = (result.props?["pages"] as? [[String: Any]] ?? []).compactMap {
            try? JSONSerialization.data(withJSONObject: $0)
          }
          await DepartureRefresh.shared.update(configuration, rawPages: pages)
        }
        // Read the current plan and cards after refresh. The app can change either during the request.
        published.getSnapshot(in: context) { latest in
          let now = Date.now
          let entries = Self.entries(from: latest.props, now: now)
          guard WidgetPreferences.allowsAccess(latest.props) else {
            completion(Timeline(entries: entries, policy: .never))
            return
          }
          let configuration = Self.configuration(from: latest.props) ?? SavedConfiguration(pages: [])
          completion(Timeline(entries: entries, policy: .after(DepartureRefresh.nextWake(configuration, now: now))))
        }
      }
    }
  }

  private static func configuration(from props: [String: Any]?) -> SavedConfiguration? {
    guard let props, let data = try? JSONSerialization.data(withJSONObject: props) else { return nil }
    return try? JSONDecoder().decode(SavedConfiguration.self, from: data)
  }

  private static func entries(from props: [String: Any]?, now: Date) -> [SavedEntry] {
    guard WidgetPreferences.allowsAccess(props) else { return [SavedEntry(date: now, locked: true)] }
    guard let config = configuration(from: props), !config.pages.isEmpty,
          let raw = props?["pages"] as? [[String: Any]]
    else { return [SavedEntry(date: now)] }
    let selected = WidgetPreferences.defaults?.string(forKey: WidgetPreferences.pageKey)
    let index = config.pages.firstIndex { $0.key == selected } ?? 0
    let page = config.pages[index]
    let count = config.pages.count
    let cached = config.origin.flatMap { origin in
      RefreshCache.load(origin).response(for: page)?.projectionInput
    }
    var entry = SavedEntry(
      date: now, board: SavedBoard.decode(raw[index]["board"]), page: index + 1,
      count: count, previous: count > 1 ? config.pages[(index + count - 1) % count].key : nil,
      next: count > 1 ? config.pages[(index + 1) % count].key : nil,
      canRefresh: config.origin != nil && page.review != true
    )
    // Share platform matching, branch wording, formatting and expiry with the foreground app.
    guard let projection = widgetProjection(),
          let result = projection.invokeMethod("projectWidgetTimeline",
            withArguments: [raw[index], cached as Any? ?? NSNull(), milliseconds(now)]),
          let timeline = result.toArray() as? [[String: Any]], !timeline.isEmpty
    else { return [entry] }
    return timeline.map { step in
      entry.date = Date(timeIntervalSince1970: (step["timestamp"] as? Double ?? milliseconds(now)) / 1_000)
      entry.board = SavedBoard.decode(step["props"]) ?? entry.board
      return entry
    }
  }
}

@available(iOS 17.0, *)
private struct SavedPlatformView: View {
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.widgetFamily) private var widgetFamily
  var entry: SavedEntry

  private var dark: Bool {
    entry.board?.interfaceTheme.map { $0 == "dark" } ?? (colorScheme == .dark)
  }
  private var foreground: Color { Color(boardHex: dark ? "#ECEDEF" : "#222528") }
  private var secondary: Color { Color(boardHex: dark ? "#929398" : "#60646B") }

  private var fresh: Bool {
    // WidgetKit can render a future timeline entry before displaying it.
    let displayTime = milliseconds(max(.now, entry.date))
    return (entry.board?.staleAt ?? entry.board?.expiresAt ?? 0) > displayTime
  }

  private var status: String {
    fresh ? "Departures are up to date" : "Departures may be out of date"
  }

  var body: some View {
    let locked = entry.locked || !WidgetPreferences.allowsPublishedAccess
    VStack(spacing: 0) {
      if locked {
        VStack(spacing: 6) {
          Text("Saved Platforms").font(.headline).accessibilityAddTraits(.isHeader)
          Text("Available with NextBranch Pro").font(.subheadline)
          Text("View Plans").font(.subheadline.bold())
        }
        .multilineTextAlignment(.center)
        .foregroundStyle(foreground)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.horizontal, 16)
      } else if let board = entry.board {
        heading(board)
        SavedDeparturePanel(board: board, roomy: widgetFamily == .systemLarge)
          .invalidatableContent()
        footer
      } else {
        VStack(spacing: 4) {
          Text("NextBranch").font(.headline)
          Text("Save a platform in NextBranch").font(.subheadline)
        }
          .foregroundStyle(foreground)
          .frame(maxWidth: .infinity, maxHeight: .infinity)
      }
    }
    .containerBackground(Color(boardHex: dark ? "#171719" : "#FFFFFF"), for: .widget)
    .widgetURL(locked ? WidgetPreferences.plansURL : nil)
    .privacySensitive()
  }

  private func heading(_ board: SavedBoard) -> some View {
    let station = Text(board.station)
      .font(.system(size: 19, weight: .bold))
      .tracking(-0.25)
      .foregroundStyle(foreground)
      .minimumScaleFactor(0.6)
      .accessibilityAddTraits(.isHeader)
    let platform = Text(board.platform ?? "")
      .font(.system(size: 14))
      .foregroundStyle(secondary)
      .minimumScaleFactor(0.65)
    let identity = VStack(alignment: .leading, spacing: 1) {
      station
      if board.platform != nil { platform }
    }
    let markers = lineLabels(board)
    return Group {
      if (board.lineMarkers?.count ?? 0) > 1 {
        HStack(spacing: 8) {
          identity.frame(maxWidth: .infinity, alignment: .leading)
          markers
        }
      } else {
        ViewThatFits(in: .horizontal) {
          HStack(spacing: 8) {
            identity.fixedSize(horizontal: true, vertical: false)
            Spacer(minLength: 0)
            markers.fixedSize(horizontal: true, vertical: false)
          }
          // Let a long station name use the entire width before reducing its type size.
          VStack(alignment: .leading, spacing: 1) {
            station
            HStack(spacing: 8) {
              if board.platform != nil { platform.layoutPriority(1) }
              Spacer(minLength: 0)
              markers
            }
          }
        }
      }
    }
    .lineLimit(1)
    .padding(.horizontal, 20)
    .padding(.top, 4)
    .frame(maxWidth: .infinity, minHeight: 50, maxHeight: 50, alignment: .leading)
  }

  private func lineLabels(_ board: SavedBoard) -> some View {
    VStack(alignment: .trailing, spacing: 0) {
      if let markers = board.lineMarkers {
        ForEach(markers.indices, id: \.self) { index in
          let marker = markers[index]
          HStack(spacing: 5) {
            RoundedRectangle(cornerRadius: 3)
              .fill(Color(boardHex: marker.colour))
              .strokeBorder(foreground, lineWidth: 1)
              .frame(width: 17, height: 7)
              .accessibilityHidden(true)
            Text(marker.name)
          }
        }
      } else if let lines = board.lines {
        Text(lines)
      }
    }
    .font(.system(size: 12, weight: .bold))
    .foregroundStyle(foreground)
    .minimumScaleFactor(0.7)
  }

  private var footer: some View {
    HStack(spacing: 0) {
      Circle()
        .fill(Color(boardHex: fresh ? (dark ? "#6BCC8B" : "#247A40") : (dark ? "#F2AC48" : "#9A6207")))
        .frame(width: 8, height: 8)
        .frame(width: 44, height: 44)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(status)
      Spacer(minLength: 4)
      if entry.count > 1 {
        Text("\(entry.page)/\(entry.count)")
          .fixedSize()
          .accessibilityLabel("Platform \(entry.page) of \(entry.count)")
          .padding(.trailing, 4)
      }
      if let previous = entry.previous, let next = entry.next {
        Button(intent: ChoosePlatform(key: previous)) { control("chevron.up", compact: true) }
          .accessibilityLabel("Previous platform")
        Button(intent: ChoosePlatform(key: next)) { control("chevron.down", compact: true) }
          .accessibilityLabel("Next platform")
      }
      if entry.canRefresh {
        Button(intent: RefreshDepartures()) { control("arrow.clockwise") }
          .accessibilityLabel("Refresh departures")
      }
    }
    .font(.system(size: 11).monospacedDigit())
    .foregroundStyle(secondary)
    .buttonStyle(.plain)
    .padding(.leading, 2)
    .padding(.trailing, 12)
    .frame(height: 44)
  }

  private func control(_ image: String, compact: Bool = false) -> some View {
    Image(systemName: image)
      .font(.system(size: compact ? 11 : 13, weight: .semibold))
      .frame(width: compact ? 26 : 36, height: compact ? 24 : 34)
      .background(dark ? Color.white.opacity(0.08) : Color.black.opacity(0.055),
                  in: RoundedRectangle(cornerRadius: compact ? 6 : 8))
      .frame(width: 44, height: 44)
      .contentShape(Rectangle())
  }
}

/// Gives each display style the same three departure slots between the header and controls.
private struct SavedDeparturePanel: View {
  var board: SavedBoard
  var roomy: Bool

  private var amber: Bool { board.style == "amber" }
  private var colors: SavedBoard.Palette {
    board.colors ?? .init(background: "#080C10", dot: "#29303B", frame: "#1B3444", rule: "#4F9BBB", text: "#BDEBFF", step: 7)
  }
  private var ink: Color { Color(boardHex: colors.text) }

  var body: some View {
    let rows = Array(board.rows.prefix(3))
    Group {
      if rows.isEmpty {
        Text(board.message ?? "No upcoming departures")
          .font(.system(size: 12))
          .foregroundStyle(ink)
          .lineLimit(2)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
          .padding(.horizontal, 16)
      } else {
        VStack(spacing: 0) {
          ForEach(0..<3) { index in
            if index < rows.count {
              departure(rows[index], at: index)
                .overlay(alignment: .bottom) {
                  if index + 1 < rows.count {
                    rule(colors.rule).padding(.horizontal, 12)
                  }
                }
            } else {
              Color.clear.frame(maxHeight: .infinity).accessibilityHidden(true)
            }
          }
        }
        .padding(.vertical, 3)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background {
      Canvas { context, size in
        let step = max(4, colors.step)
        let dot: CGFloat = amber ? 1.4 : 2
        var pattern = Path()
        for y in stride(from: step / 2, to: size.height, by: step) {
          for x in stride(from: step / 2, to: size.width, by: step) {
            pattern.addEllipse(in: CGRect(x: x - dot / 2, y: y - dot / 2, width: dot, height: dot))
          }
        }
        context.fill(pattern, with: .color(Color(boardHex: colors.dot)))
      }
      .accessibilityHidden(true)
    }
    .background(Color(boardHex: colors.background))
    .overlay(alignment: .top) { rule(colors.frame) }
    .overlay(alignment: .bottom) { rule(colors.frame) }
  }

  private func departure(_ row: SavedBoard.Row, at index: Int) -> some View {
    let ordinal = String(index + 1)
    let matrix = board.ordinalMatrices.flatMap { $0.indices.contains(index) ? $0[index] : nil }
    let family = amber ? "AvenirNext-Regular" : "GillSans"
    let countdown = row.countdown ?? "—"
    let step: CGFloat = roomy ? 2.2 : 1.8
    return HStack(spacing: 7) {
      Group {
        if let matrix {
          WidgetLED(lines: [matrix], color: ink, maxDotStep: step)
        } else {
          Text(amber ? ordinal : ordinal + ".").font(.custom(family, size: 15))
        }
      }
      .frame(width: 16, alignment: .leading)
      Group {
        if let destination = row.destinationMatrix {
          WidgetLED(lines: destination, color: ink, maxDotStep: step)
        } else {
          Text(row.identity)
            .font(.custom(amber ? family : "GillSans-SemiBold", size: roomy ? 19 : amber ? 14 : 16))
            .lineLimit(2)
            .minimumScaleFactor(0.7)
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      Group {
        if let matrix = row.countdownMatrix {
          WidgetLED(lines: [matrix], color: ink, maxDotStep: step, trailing: true)
        } else {
          Text(countdown)
            .font(.custom(amber ? family : "GillSans-SemiBold", size: roomy ? 19 : 15).monospacedDigit())
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
      }
      .frame(width: roomy ? 74 : 61, alignment: .trailing)
    }
    .foregroundStyle(ink)
    .padding(.horizontal, 16)
    .frame(maxHeight: .infinity)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel([ordinal, row.identity, row.countdown].compactMap { $0 }.joined(separator: ", "))
  }

  private func rule(_ hex: String) -> some View {
    Rectangle().fill(Color(boardHex: hex)).frame(height: 1).accessibilityHidden(true)
  }
}

/// Draws the shared Amber glyphs at a consistent scale across wrapped lines.
private struct WidgetLED: View {
  var lines: [[String]]
  var color: Color
  var maxDotStep: CGFloat
  var trailing = false

  var body: some View {
    Canvas { context, size in
      guard let width = lines.compactMap({ $0.first?.utf8.count }).max(), width > 0 else { return }
      let height = CGFloat(lines.count * 8 - 1)
      let step = min(maxDotStep, size.width / CGFloat(width), size.height / height)
      let dot = step * 0.78
      let top = (size.height - height * step) / 2
      var lit = Path()
      for (line, strips) in lines.enumerated() {
        let x = trailing ? size.width - CGFloat(strips.first?.utf8.count ?? 0) * step : 0
        for (row, strip) in strips.enumerated() {
          for (column, bit) in strip.utf8.enumerated() where bit == 49 {
            let rect = CGRect(x: x + CGFloat(column) * step, y: top + CGFloat(line * 8 + row) * step,
                              width: dot, height: dot)
            lit.addRoundedRect(in: rect, cornerSize: CGSize(width: dot * 0.25, height: dot * 0.25))
          }
        }
      }
      context.fill(lit, with: .color(color))
    }
    .accessibilityHidden(true)
  }
}

private extension Color {
  init(boardHex value: String) {
    let rgb = UInt32(value.dropFirst(), radix: 16) ?? 0
    self.init(red: Double((rgb >> 16) & 255) / 255, green: Double((rgb >> 8) & 255) / 255, blue: Double(rgb & 255) / 255)
  }
}

@available(iOS 17.0, *)
struct SavedPlatforms: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: WidgetPreferences.kind, provider: SavedProvider()) { entry in
      SavedPlatformView(entry: entry)
    }
    .configurationDisplayName("Saved Platforms")
    .description("Switch between your saved platform departure boards.")
    .supportedFamilies([.systemMedium, .systemLarge])
    .contentMarginsDisabled()
  }
}
