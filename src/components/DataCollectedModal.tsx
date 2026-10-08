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
        { name: 'Walking Mode (≤ 15 km/h)', type: 'Enum (walking)', desc: 'Walking, jogging, or foot travel with footprints icon.' },
        { name: 'Vehicle Mode (15 - 200 km/h)', type: 'Enum (vehicle)', desc: 'Motorized transit rendered as blue route path.' },
        { name: 'Airplane Mode (> 200 km/h)', type: 'Enum (airplane)', desc: 'High-speed aviation flight corridor rendered in purple.' },
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
    {
      category: '5. Required API Endpoints & Realtime SignalR Hub',
      icon: Server,
      fields: [
        { name: 'GET /api/users', type: 'REST Endpoint', desc: 'Fetch all users & live location points (sorting/date filters done on front-end).' },
        { name: 'GET /api/users/{id}/location', type: 'REST Endpoint', desc: 'Fetch current location for specific user.' },
        { name: 'POST /api/routes/calculate', type: 'REST Endpoint', desc: 'Calculate directions & route options.' },
        { name: 'POST /api/routes/start', type: 'REST Endpoint', desc: 'API endpoint to start route navigation for user.' },
        { name: 'POST /api/routes/cancel', type: 'REST Endpoint', desc: 'API endpoint to cancel active route navigation.' },
        { name: 'GET /api/routes/history', type: 'REST Endpoint', desc: 'Fetch route history (date range & sorting handled client-side).' },
        { name: 'GET /api/markers', type: 'REST Endpoint', desc: 'Fetch custom saved markers.' },
        { name: 'GET /api/places', type: 'REST Endpoint', desc: 'Fetch recorded stay points.' },
        { name: 'GET /api/movements/segments', type: 'REST Endpoint', desc: 'Fetch journey movement segments.' },
        { name: 'WS /LocationTracker', type: 'SignalR Hub', desc: 'Realtime WebSocket stream for location updates, route starts & route cancels (app.MapHub<LocationTrackerHub>("/LocationTracker")).' },
      ],
    },
  ];

  const backendSchemaSnippet = `// =========================================================================
// ASP.NET Core 8 / C# Data Transfer Objects (DTOs) & Controllers
// RouteTracker Telemetry Ingestion & Storage Architecture
// =========================================================================

namespace RouteTracker.DTOs
{
    using System;
    using System.Collections.Generic;
    using System.ComponentModel.DataAnnotations;

    public enum JourneyStatus
    {
        Active = 1,
        Completed,
        Cancelled
    }

    public enum TravelMode
    {
        Vehicle = 1,
        Walking,
        Airplane
    }

    // ----------------------------------------------------
    // ROUTE LOG DTOs
    // ----------------------------------------------------
    public class CreateRouteLogDto
    {
        public int UserId { get; set; }
        public int RouteId { get; set; }
        public int JourneyId { get; set; }
        public string OriginName { get; set; } = string.Empty;
        public string DestinationName { get; set; } = string.Empty;
        public float TotalDistanceMeters { get; set; }
        public int DurationSeconds { get; set; }
        public TravelMode TravelMode { get; set; }
        public DateTimeOffset CompletedAt { get; set; } = DateTimeOffset.UtcNow;
    }

    public class GetRouteLogDto
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public int RouteId { get; set; }
        public int JourneyId { get; set; }
        public string OriginName { get; set; } = string.Empty;
        public string DestinationName { get; set; } = string.Empty;
        public float TotalDistanceMeters { get; set; }
        public int DurationSeconds { get; set; }
        public TravelMode TravelMode { get; set; }
        public DateTimeOffset CompletedAt { get; set; } = DateTimeOffset.UtcNow;
    }

    public class UpdateRouteLogDto
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public int RouteId { get; set; }
        public int JourneyId { get; set; }
        public string OriginName { get; set; } = string.Empty;
        public string DestinationName { get; set; } = string.Empty;
        public float TotalDistanceMeters { get; set; }
        public int DurationSeconds { get; set; }
        public TravelMode TravelMode { get; set; }
        public DateTimeOffset CompletedAt { get; set; } = DateTimeOffset.UtcNow;
    }

    // ----------------------------------------------------
    // COORDINATE DTOs
    // ----------------------------------------------------
    public class CreateCoordinateDto
    {
        [Required]
        public int UserId { get; set; }
        [Required]
        public int JourneyId { get; set; }
        public int? RouteId { get; set; }
        public long SequenceIndex { get; set; }
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public double? Altitude { get; set; }
        public float? AccuracyMeters { get; set; }
        public float? HeadingDegrees { get; set; }
        public float SpeedKmH { get; set; }
    }

    public class GetCoordinateDto
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public int JourneyId { get; set; }
        public int? RouteId { get; set; }
        public long SequenceIndex { get; set; }
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public double? Altitude { get; set; }
        public float? AccuracyMeters { get; set; }
        public float? HeadingDegrees { get; set; }
        public float SpeedKmH { get; set; }
        public DateTimeOffset Timestamp { get; set; }
    }

    // ----------------------------------------------------
    // CUSTOM MARKER DTOs
    // ----------------------------------------------------
    public class CreateCustomMarkerDto
    {
        [Required]
        public int UserId { get; set; }
        public string UserColor { get; set; } = "#3B82F6";
        [Required]
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = "generic";
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public bool IsFromStayPoint { get; set; }
    }

    public class GetCustomMarkerDto
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string UserColor { get; set; } = "#3B82F6";
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = "generic";
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public bool IsFromStayPoint { get; set; }
        public DateTimeOffset CreatedAt { get; set; }
    }

    public class UpdateCustomMarkerDto
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public string UserColor { get; set; } = "#3B82F6";
        [Required]
        public string Name { get; set; } = string.Empty;
        public string Category { get; set; } = "generic";
        public double Latitude { get; set; }
        public double Longitude { get; set; }
        public bool IsFromStayPoint { get; set; }
    }

    // ----------------------------------------------------
    // JOURNEY SESSION DTOs
    // ----------------------------------------------------
    public class CreateJourneySessionDto
    {
        public int UserId { get; set; }
        public DateTimeOffset StartTime { get; set; }
        public DateTimeOffset? EndTime { get; set; }
        public float TotalDistanceMeters { get; set; }
        public int TotalDurationSeconds { get; set; }
        public float AverageSpeedKmH { get; set; }
        public JourneyStatus Status { get; set; }
        public List<CreateCoordinateDto>? Coordinates { get; set; } = new();
    }

    public class GetJourneySessionDto
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public DateTimeOffset StartTime { get; set; }
        public DateTimeOffset? EndTime { get; set; }
        public float TotalDistanceMeters { get; set; }
        public int TotalDurationSeconds { get; set; }
        public float AverageSpeedKmH { get; set; }
        public JourneyStatus Status { get; set; }
        public List<GetCoordinateDto>? Coordinates { get; set; } = new();
    }

    public class UpdateJourneySessionDto
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public DateTimeOffset StartTime { get; set; }
        public DateTimeOffset? EndTime { get; set; }
        public float TotalDistanceMeters { get; set; }
        public int TotalDurationSeconds { get; set; }
        public float AverageSpeedKmH { get; set; }
        public JourneyStatus Status { get; set; }
    }
}

namespace RouteTracker.Controllers
{
    using Microsoft.AspNetCore.Mvc;
    using RouteTracker.DTOs;

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
        /// 1. Create a new journey session for a user.
        /// POST /api/telemetry/journeys
        /// </summary>
        [HttpPost("journeys")]
        public async Task<ActionResult<GetJourneySessionDto>> CreateJourney([FromBody] CreateJourneySessionDto dto)
        {
            var session = await _telemetryService.CreateJourneyAsync(dto);
            return CreatedAtAction(nameof(GetJourneyById), new { id = session.Id }, session);
        }

        /// <summary>
        /// 2. Post a new coordinate point for a journey.
        /// POST /api/telemetry/coordinates
        /// </summary>
        [HttpPost("coordinates")]
        public async Task<ActionResult<GetCoordinateDto>> CreateCoordinate([FromBody] CreateCoordinateDto dto)
        {
            var saved = await _telemetryService.SaveCoordinateAsync(dto);
            return StatusCode(201, saved);
        }

        /// <summary>
        /// 3. Create a custom saved marker.
        /// POST /api/telemetry/markers
        /// </summary>
        [HttpPost("markers")]
        public async Task<ActionResult<GetCustomMarkerDto>> CreateMarker([FromBody] CreateCustomMarkerDto dto)
        {
            var saved = await _telemetryService.CreateMarkerAsync(dto);
            return CreatedAtAction(nameof(GetMarkerById), new { id = saved.Id }, saved);
        }

        /// <summary>
        /// 4. Update custom saved marker by ID.
        /// PUT /api/telemetry/markers/{id}
        /// </summary>
        [HttpPut("markers/{id:int}")]
        public async Task<ActionResult<GetCustomMarkerDto>> UpdateMarker(int id, [FromBody] UpdateCustomMarkerDto dto)
        {
            var updated = await _telemetryService.UpdateMarkerAsync(id, dto);
            return Ok(updated);
        }

        /// <summary>
        /// 5. Update journey session status and metrics.
        /// PUT /api/telemetry/journeys/{id}
        /// </summary>
        [HttpPut("journeys/{id:int}")]
        public async Task<ActionResult<GetJourneySessionDto>> UpdateJourney(int id, [FromBody] UpdateJourneySessionDto dto)
        {
            var updated = await _telemetryService.UpdateJourneyAsync(id, dto);
            return Ok(updated);
        }
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
        /// 7. Retrieve all custom markers created by a user (No backend sorting; done on client).
        /// GET /api/telemetry/markers?userId={userId}
        /// </summary>
        [HttpGet("markers")]
        public async Task<ActionResult<List<CustomMarker>>> GetMarkersByUser([FromQuery] string userId)
        {
            var markers = await _telemetryService.GetMarkersByUserAsync(userId);
            return Ok(markers);
        }

        /// <summary>
        /// 8. Start route navigation session.
        /// POST /api/routes/start
        /// </summary>
        [HttpPost("/api/routes/start")]
        public async Task<IActionResult> StartRoute([FromBody] StartRouteDto dto)
        {
            await _telemetryService.StartRouteAsync(dto);
            await _hubContext.Clients.All.SendAsync("ReceiveRouteStarted", dto.UserId, dto.DestinationName, dto.DestinationCoords);
            return Ok(new { success = true, status = "active" });
        }

        /// <summary>
        /// 9. Cancel active route navigation session.
        /// POST /api/routes/cancel
        /// </summary>
        [HttpPost("/api/routes/cancel")]
        public async Task<IActionResult> CancelRoute([FromBody] CancelRouteDto dto)
        {
            var log = await _telemetryService.CancelRouteAsync(dto);
            await _hubContext.Clients.All.SendAsync("ReceiveRouteCancelled", dto.UserId, dto.DestinationName, dto.DurationSeconds);
            return Ok(new { success = true, logId = log.Id, status = "cancelled" });
        }
    }

    /// <summary>
    /// SignalR Realtime Hub for live location streaming, route starts and cancels.
    /// URL: /LocationTracker (app.MapHub<LocationTrackerHub>("/LocationTracker");)
    /// </summary>
    public class LocationTrackerHub : Hub
    {
        public async Task SendLocationUpdate(string userId, double lat, double lng, double speed)
        {
            await Clients.Others.SendAsync("ReceiveLocationUpdate", userId, lat, lng, speed);
        }

        public async Task StartRoute(string userId, string destName, object destCoords)
        {
            await Clients.Others.SendAsync("ReceiveRouteStarted", userId, destName, destCoords);
        }

        public async Task CancelRoute(string userId, string destName, int durationSeconds)
        {
            await Clients.Others.SendAsync("ReceiveRouteCancelled", userId, destName, durationSeconds);
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
              walked (&le; 15 km/h, shown with footprints icon), traveled in a vehicle (15&ndash;200 km/h,
              rendered as a dotted blue line), or flew on an airplane (&gt; 200 km/h, rendered as a purple flight corridor). Stationary locations are recorded as places, custom markers can
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
