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
      category: '1. Coordinates & Geospatial Attributes',
      icon: Navigation,
      fields: [
        { name: 'Latitude (lat)', type: 'Float (double)', desc: 'Geographic latitude with ~1 meter precision.' },
        { name: 'Longitude (lng)', type: 'Float (double)', desc: 'Geographic longitude with ~1 meter precision.' },
        { name: 'Accuracy (meters)', type: 'Float', desc: 'GPS accuracy radius from device hardware.' },
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
        { name: 'Dwell Time (s)', type: 'Integer', desc: 'Continuous stationary duration at a resting spot.' },
      ],
    },
    {
      category: '3. Movement Classification & Velocity',
      icon: Gauge,
      fields: [
        { name: 'Instantaneous Speed', type: 'Float (km/h & m/s)', desc: 'Real-time velocity detected by GPS sensors.' },
        { name: 'Trekking Mode (≤ 15 km/h)', type: 'Enum (trekking)', desc: 'Walking, jogging, or hiking. Rendered with footprints icon.' },
        { name: 'Vehicle Mode (> 15 km/h)', type: 'Enum (vehicle)', desc: 'Motorized transit. Rendered as a dotted blue line.' },
        { name: 'Distance (meters)', type: 'Float', desc: 'Calculated geodesic delta between consecutive points.' },
      ],
    },
    {
      category: '4. Markers, Visited Places & Route Suggestions',
      icon: MapPin,
      fields: [
        { name: 'Custom Markers', type: 'Object Array', desc: 'User placed points with name, description, and icon.' },
        { name: 'Recorded Places', type: 'Object Array', desc: 'Auto-saved when user stays stationary at a spot.' },
        { name: 'Suggested Routes', type: 'Object Array', desc: 'Nearest & alternative corridors with ETA at current speed.' },
      ],
    },
  ];

  const backendSchemaSnippet = `// Backend Storage Schema (PostgreSQL / Firestore)
// 1. Visited Places Table
CREATE TABLE visited_places (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name VARCHAR(64) NOT NULL DEFAULT 'Inioluwa',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy_meters REAL NOT NULL,
  place_name TEXT,
  formatted_address TEXT,
  arrived_at TIMESTAMPTZ NOT NULL,
  departed_at TIMESTAMPTZ,
  dwell_duration_seconds INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

// 2. Journey Segments Table
CREATE TABLE journey_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_name VARCHAR(64) NOT NULL DEFAULT 'Inioluwa',
  travel_mode VARCHAR(16) CHECK (travel_mode IN ('trekking', 'vehicle')),
  start_lat DOUBLE PRECISION NOT NULL,
  start_lng DOUBLE PRECISION NOT NULL,
  end_lat DOUBLE PRECISION NOT NULL,
  end_lng DOUBLE PRECISION NOT NULL,
  distance_meters REAL NOT NULL,
  duration_seconds REAL NOT NULL,
  average_speed_kmh REAL NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL
);

// 3. User Custom Markers
CREATE TABLE custom_markers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  category VARCHAR(32) NOT NULL DEFAULT 'generic',
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);`;

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

          {/* Backend SQL Schema */}
          <div
            className={`border rounded-xl p-4 space-y-3 ${
              isDark ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-900 border-zinc-800 text-zinc-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Backend Database Schema
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
                    <Copy className="w-3.5 h-3.5" /> Copy SQL
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
