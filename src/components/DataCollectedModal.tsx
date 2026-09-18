import React, { useState } from 'react';
import {
  Database,
  Clock,
  Navigation,
  Gauge,
  MapPin,
  ShieldCheck,
  Server,
  X,
  Copy,
  Check,
} from 'lucide-react';
import { AppTheme } from '../types';

interface DataCollectedModalProps {
  isOpen: boolean;
  theme?: AppTheme;
  onClose: () => void;
}

export const DataCollectedModal: React.FC<DataCollectedModalProps> = ({
  isOpen,
  theme = 'light',
  onClose,
}) => {
  const [copiedSchema, setCopiedSchema] = useState(false);

  if (!isOpen) return null;

  const isDark = theme === 'dark';

  const dataFields = [
    {
      category: '1. Coordinates & Geospatial Attributes (Tied to User, Journey & Route)',
      icon: Navigation,
      fields: [
        { name: 'User ID (userId)', type: 'String / Guid', desc: 'Identifies the user generating the coordinate data.' },
        { name: 'Journey ID (journeyId)', type: 'String / Guid', desc: 'Unique journey session grouping a sequence of points.' },
        { name: 'Route ID (routeId)', type: 'String / Guid (Nullable)', desc: 'Identifies the selected active route path.' },
        { name: 'Sequence Index (sequenceIndex)', type: 'Integer', desc: 'Monotonically incrementing order for precise plotting.' },
        { name: 'Latitude & Longitude', type: 'Float (double)', desc: 'Geographic coordinates with high sub-meter precision.' },
        { name: 'Accuracy (meters)', type: 'Float', desc: 'GPS horizontal accuracy radius reported by device.' },
        { name: 'Heading (degrees)', type: 'Float (0-360°)', desc: 'Direction of travel relative to true north.' },
      ],
    },
    {
      category: '2. Temporal & Timestamp Metrics',
      icon: Clock,
      fields: [
        { name: 'Timestamp (Epoch ms)', type: 'Integer (Int64)', desc: 'Exact millisecond Unix epoch when coordinate was sampled.' },
        { name: 'ISO 8601 Timestamp', type: 'String', desc: 'Standard UTC date-time string.' },
        { name: 'Segment Duration (s)', type: 'Integer', desc: 'Elapsed travel time between origin and destination point.' },
        { name: 'Dwell Time (s)', type: 'Integer', desc: 'Continuous stationary duration at a resting spot (≥ 90s for recorded place).' },
      ],
    },
    {
      category: '3. Movement Classification & Velocity',
      icon: Gauge,
      fields: [
        { name: 'Instantaneous Speed', type: 'Float (km/h & m/s)', desc: 'Real-time velocity detected by GPS sensors.' },
        { name: 'Trekking Mode (≤ 15 km/h)', type: 'Enum (trekking)', desc: 'Walking, jogging, or hiking with footprints icon.' },
        { name: 'Vehicle Mode (> 15 km/h)', type: 'Enum (vehicle)', desc: 'Motorized transit rendered as blue route path.' },
        { name: 'Distance (meters)', type: 'Float', desc: 'Calculated geodesic delta between consecutive points.' },
      ],
    },
    {
      category: '4. Markers (Tied to User) & Visited Places',
      icon: MapPin,
      fields: [
        { name: 'Custom Markers', type: 'Object Array', desc: 'User placed points with name, description, category, and userId.' },
        { name: 'Recorded Places', type: 'Object Array', desc: 'Auto-saved when user stays stationary at a spot for ≥ 90s.' },
        { name: 'Active Route Suggestions', type: 'Object Array', desc: 'Real street corridors with multi-mode ETAs.' },
      ],
    },
  ];

  const backendSchemaSnippet = `// =========================================================================
// ASP.NET Core 8 / C# Data Models & Controller Methods
// RouteTracker Telemetry Ingestion & Storage Architecture
// =========================================================================

namespace RouteTracker.Models
{
    /// <summary>
    /// Individual coordinate point recorded during a journey.
    /// Strictly tied to a specific User, Journey, and optional Route.
    /// </summary>
    public class CoordinatePoint
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        
        [Required]
        public string UserId { get; set; } = string.Empty; // e.g., "user-1" or Auth GUID
        
        [Required]
        public Guid JourneyId { get; set; } // Identifies the continuous journey session
        
        public string? RouteId { get; set; } // Identifies the designated active route corridor
        
        public long SequenceIndex { get; set; } // Monotonic order (0, 1, 2, ...) for plotting
        
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public double? Altitude { get; set; }
        public float? AccuracyMeters { get; set; }
        public float? HeadingDegrees { get; set; }
        public float SpeedKmH { get; set; }
        public DateTimeOffset Timestamp { get; set; } = DateTimeOffset.UtcNow;
    }

    /// <summary>
    /// Metadata summarizing a complete user journey session.
    /// </summary>
    public class JourneySession
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string UserId { get; set; } = string.Empty;
        public string UserName { get; set; } = string.Empty;
        public DateTimeOffset StartTime { get; set; }
        public DateTimeOffset? EndTime { get; set; }
        public float TotalDistanceMeters { get; set; }
        public int TotalDurationSeconds { get; set; }
        public float AverageSpeedKmH { get; set; }
        public string Status { get; set; } = "Active"; // "Active", "Completed", "Cancelled"
        public List<CoordinatePoint> Coordinates { get; set; } = new();
    }

    /// <summary>
    /// Custom map marker tied strictly to a specific user.
    /// </summary>
    public class CustomMarker
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        
        [Required]
        public string UserId { get; set; } = string.Empty; // User that created this marker
        public string UserName { get; set; } = string.Empty;
        public string UserColor { get; set; } = "#3B82F6";
        
        [Required]
        public string Name { get; set; } = string.Empty;
        public string Description { get; set; } = string.Empty;
        public string Category { get; set; } = "generic"; // work, cafe, home, landmark, store
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public bool IsFromStayPoint { get; set; }
        public DateTimeOffset CreatedAt { get; set; } = DateTimeOffset.UtcNow;
    }

    /// <summary>
    /// Completed route log for historical analysis and playback.
    /// </summary>
    public class CompletedRouteLog
    {
        public Guid Id { get; set; } = Guid.NewGuid();
        public string UserId { get; set; } = string.Empty;
        public string RouteId { get; set; } = string.Empty;
        public Guid JourneyId { get; set; }
        public string OriginName { get; set; } = string.Empty;
        public string DestinationName { get; set; } = string.Empty;
        public float TotalDistanceMeters { get; set; }
        public int DurationSeconds { get; set; }
        public string TravelMode { get; set; } = "vehicle";
        public DateTimeOffset CompletedAt { get; set; } = DateTimeOffset.UtcNow;
    }
}

namespace RouteTracker.Controllers
{
    using Microsoft.AspNetCore.Mvc;
    using RouteTracker.Models;

    /// <summary>
    /// Backend API Controller for telemetry data ingestion, saving and querying.
    /// </summary>
    [ApiController]
    [Route("api/[controller]")]
    public class TelemetryController : ControllerBase
    {
        private readonly ITelemetryService _telemetryService;

        public TelemetryController(ITelemetryService telemetryService)
        {
            _telemetryService = telemetryService;
        }

        /// <summary>
        /// 1. Start a new journey session for a user.
        /// POST /api/telemetry/journeys/start
        /// </summary>
        [HttpPost("journeys/start")]
        public async Task<ActionResult<JourneySession>> StartJourney([FromBody] StartJourneyDto dto)
        {
            var session = await _telemetryService.CreateJourneyAsync(dto.UserId, dto.UserName);
            return Ok(session);
        }

        /// <summary>
        /// 2. Stream and save a single coordinate point (silently recorded).
        /// POST /api/telemetry/coordinates
        /// </summary>
        [HttpPost("coordinates")]
        public async Task<IActionResult> SaveCoordinate([FromBody] CoordinatePoint point)
        {
            await _telemetryService.SaveCoordinateAsync(point);
            return StatusCode(201);
        }

        /// <summary>
        /// 3. Ingest a batch of coordinates for high-throughput buffering.
        /// POST /api/telemetry/coordinates/batch
        /// </summary>
        [HttpPost("coordinates/batch")]
        public async Task<IActionResult> SaveCoordinateBatch([FromBody] List<CoordinatePoint> points)
        {
            await _telemetryService.SaveBatchAsync(points);
            return Ok(new { insertedCount = points.Count });
        }

        /// <summary>
        /// 4. Complete an active journey session and compute aggregates.
        /// PUT /api/telemetry/journeys/{journeyId}/complete
        /// </summary>
        [HttpPut("journeys/{journeyId:guid}/complete")]
        public async Task<IActionResult> CompleteJourney(Guid journeyId, [FromBody] CompleteJourneyDto dto)
        {
            var result = await _telemetryService.CompleteJourneyAsync(journeyId, dto);
            return Ok(result);
        }

        /// <summary>
        /// 5. Save a custom marker tied to a specific user.
        /// POST /api/telemetry/markers
        /// </summary>
        [HttpPost("markers")]
        public async Task<ActionResult<CustomMarker>> CreateMarker([FromBody] CustomMarker marker)
        {
            var saved = await _telemetryService.SaveMarkerAsync(marker);
            return CreatedAtAction(nameof(GetMarkersByUser), new { userId = marker.UserId }, saved);
        }

        /// <summary>
        /// 6. Query coordinate trail for a specific user and journey.
        /// GET /api/telemetry/coordinates?userId={userId}&journeyId={journeyId}&routeId={routeId}
        /// </summary>
        [HttpGet("coordinates")]
        public async Task<ActionResult<List<CoordinatePoint>>> GetCoordinates(
            [FromQuery] string userId,
            [FromQuery] Guid? journeyId,
            [FromQuery] string? routeId)
        {
            var points = await _telemetryService.GetCoordinatesAsync(userId, journeyId, routeId);
            return Ok(points);
        }

        /// <summary>
        /// 7. Retrieve all custom markers created by a user.
        /// GET /api/telemetry/markers?userId={userId}
        /// </summary>
        [HttpGet("markers")]
        public async Task<ActionResult<List<CustomMarker>>> GetMarkersByUser([FromQuery] string userId)
        {
            var markers = await _telemetryService.GetMarkersByUserAsync(userId);
            return Ok(markers);
        }
    }
}`;

  const handleCopySchema = () => {
    navigator.clipboard.writeText(backendSchemaSnippet);
    setCopiedSchema(true);
    setTimeout(() => setCopiedSchema(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto">
      <div
        className={`rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col border overflow-hidden animate-in fade-in zoom-in-95 duration-200 transition-colors ${
          isDark
            ? 'bg-zinc-900 border-zinc-800 text-zinc-100'
            : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        {/* Header */}
        <div
          className={`p-5 border-b flex items-start justify-between ${
            isDark ? 'bg-zinc-950/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center border shadow-xs ${
                isDark
                  ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                  : 'bg-zinc-100 text-zinc-800 border-zinc-300'
              }`}
            >
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold">Data Collected &amp; Telemetry Specifications</h2>
              <p className="text-xs text-zinc-500">
                Catalog of telemetry metrics tracked during journeys and formatted for backend persistence
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Summary Box */}
          <div
            className={`rounded-xl p-4 text-xs border space-y-1.5 ${
              isDark
                ? 'bg-zinc-950/70 border-zinc-800 text-zinc-300'
                : 'bg-zinc-50 border-zinc-200 text-zinc-700'
            }`}
          >
            <div className="font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Summary of Journey Telemetry:
            </div>
            <p className="leading-relaxed text-zinc-400">
              The application samples continuous GPS points from the browser Geolocation API. Points
              are grouped into consecutive <strong>Journey Segments</strong> (with timestamps,
              coordinates, and speed). Speed is used to automatically classify whether you
              trekked (&le; 15 km/h, shown with footprints icon) or traveled in a vehicle (&gt; 15 km/h,
              rendered as a dotted blue line). Stationary locations are recorded as places, custom markers can
              be placed anywhere on the map, and suggested routes provide turn-by-turn durations at your current moving speed.
            </p>
          </div>

          {/* Categorized Fields */}
          <div className="space-y-4">
            {dataFields.map((group, gIdx) => {
              const Icon = group.icon;
              return (
                <div
                  key={gIdx}
                  className={`border rounded-xl overflow-hidden ${
                    isDark ? 'border-zinc-800' : 'border-zinc-200'
                  }`}
                >
                  <div
                    className={`px-4 py-2.5 flex items-center gap-2 border-b ${
                      isDark ? 'bg-zinc-950/80 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    <Icon className="w-4 h-4 text-zinc-400" />
                    <h3 className="text-xs font-bold uppercase tracking-wide">{group.category}</h3>
                  </div>

                  <div className={`divide-y ${isDark ? 'divide-zinc-800/80' : 'divide-zinc-100'}`}>
                    {group.fields.map((field, fIdx) => (
                      <div
                        key={fIdx}
                        className={`px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1 ${
                          isDark ? 'hover:bg-zinc-800/30' : 'hover:bg-zinc-50'
                        }`}
                      >
                        <div className="font-medium flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-zinc-400" />
                          {field.name}
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-[11px] text-zinc-500 sm:text-right max-w-sm">
                            {field.desc}
                          </span>
                          <span
                            className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                              isDark
                                ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                                : 'bg-zinc-100 text-zinc-700 border-zinc-200'
                            }`}
                          >
                            {field.type}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Backend C# Schema */}
          <div
            className={`border rounded-xl p-4 space-y-3 ${
              isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-900 border-zinc-800 text-zinc-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Backend C# Data Schema
                </span>
              </div>
              <button
                onClick={handleCopySchema}
                className="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-mono flex items-center gap-1.5 border border-zinc-700 transition"
              >
                {copiedSchema ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy C# Classes
                  </>
                )}
              </button>
            </div>
            <pre className="text-[11px] font-mono text-emerald-400 bg-zinc-950 p-3 rounded-lg overflow-x-auto border border-zinc-800">
              {backendSchemaSnippet}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div
          className={`p-4 border-t flex items-center justify-end ${
            isDark ? 'bg-zinc-950/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
          }`}
        >
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-xl text-xs font-semibold transition ${
              isDark
                ? 'bg-zinc-100 text-zinc-900 hover:bg-white'
                : 'bg-zinc-900 text-white hover:bg-zinc-800'
            }`}
          >
            Close Telemetry Specification
          </button>
        </div>
      </div>
    </div>
  );
};
