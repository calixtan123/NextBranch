# TfL station and platform discovery

The language used to describe stations, passenger platforms and the departure services available to a commuter.

## Language

**Station**
A named transport location containing one or more physical platforms. An interchange may contain platforms serving several lines or modes.

**Physical platform**
A passenger boarding location within a station that can serve one or more service lines. A platform may have a published number, name and cardinal direction.
_Avoid_ Branch, line or destination as synonyms for platform.

**TfL-serving platform**
A physical platform served by at least one TfL service line.

**Shared platform**
One physical platform served by multiple service lines, potentially including both TfL and National Rail services.

**Service line**
A named transport service serving a platform, such as District or Mildmay.
_Avoid_ Direction or branch as synonyms for line.

**Cardinal direction**
A platform's published compass direction, such as Northbound, Southbound, Eastbound or Westbound.

**Unknown direction**
A platform direction that has not been established by the available evidence. Its passenger-facing wording is “Direction unavailable”.

**Advertised towards**
The published place or places a platform's service is described as travelling towards.
_Avoid_ Destination as an automatic substitute.

**Arrival feed**
A source of live departure predictions for a transport service at a station.

**Unsupported arrival feed**
An arrival feed that the app has confirmed it cannot use for a service in the current delivery.

**Temporary feed outage**
A period when a supported arrival feed cannot supply a usable current response.

**Verified platform matching**
An evidence-backed association between a service's live departure predictions and a particular physical platform.

**Partial live coverage**
The availability of live departures for some of a physical platform's TfL service lines while coverage for other TfL lines is unavailable or unverified.
