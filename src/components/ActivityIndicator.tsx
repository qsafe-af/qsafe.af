import React from "react";

interface ActivityIndicatorProps {
  recency?: {
    daysSince: number;
    lastDate?: Date;
  };
  volume?: {
    eventCount: number;
    periodDays: number;
  };
  variant?: "compact" | "detailed" | "minimal";
  showTooltip?: boolean;
  className?: string;
}

const ActivityIndicator: React.FC<ActivityIndicatorProps> = ({
  recency,
  volume,
  variant = "compact",
  showTooltip = true,
  className = "",
}) => {
  // Calculate recency level (0-5, where 5 is most recent)
  const getRecencyLevel = (): number => {
    if (!recency) return 0;
    const { daysSince } = recency;

    if (daysSince === 0) return 5;
    if (daysSince <= 1) return 4;
    if (daysSince <= 7) return 3;
    if (daysSince <= 30) return 2;
    if (daysSince <= 90) return 1;
    return 0;
  };

  // Calculate volume level (0-5, where 5 is highest volume)
  const getVolumeLevel = (): number => {
    if (!volume || volume.eventCount === 0) return 0;
    const eventsPerDay = volume.eventCount / volume.periodDays;

    if (eventsPerDay >= 10) return 5;
    if (eventsPerDay >= 5) return 4;
    if (eventsPerDay >= 1) return 3;
    if (eventsPerDay >= 0.3) return 2;
    if (eventsPerDay > 0) return 1;
    return 0;
  };

  const recencyLevel = getRecencyLevel();
  const volumeLevel = getVolumeLevel();

  // Color mapping for levels
  const getRecencyColor = (level: number): string => {
    const colors = [
      "bg-gray-300", // 0 - inactive
      "bg-blue-300",  // 1 - old
      "bg-green-400", // 2 - recent
      "bg-yellow-400", // 3 - active
      "bg-orange-500", // 4 - very active
      "bg-red-500",    // 5 - hot
    ];
    return colors[level];
  };

  const getVolumeColor = (level: number): string => {
    const colors = [
      "bg-gray-300",   // 0 - no activity
      "bg-indigo-300", // 1 - very low
      "bg-indigo-400", // 2 - low
      "bg-purple-400", // 3 - moderate
      "bg-purple-500", // 4 - high
      "bg-purple-600", // 5 - very high
    ];
    return colors[level];
  };

  // Format relative time
  const formatRelativeTime = (daysSince: number): string => {
    if (daysSince === 0) return "Today";
    if (daysSince === 1) return "Yesterday";
    if (daysSince <= 7) return `${daysSince} days ago`;
    if (daysSince <= 30) return `${Math.floor(daysSince / 7)} weeks ago`;
    if (daysSince <= 365) return `${Math.floor(daysSince / 30)} months ago`;
    return `${Math.floor(daysSince / 365)} years ago`;
  };

  // Format volume description
  const formatVolumeDescription = (eventCount: number, periodDays: number): string => {
    const eventsPerDay = eventCount / periodDays;
    if (eventsPerDay >= 10) return "Very High Activity";
    if (eventsPerDay >= 5) return "High Activity";
    if (eventsPerDay >= 1) return "Moderate Activity";
    if (eventsPerDay >= 0.3) return "Low Activity";
    if (eventCount > 0) return "Very Low Activity";
    return "No Activity";
  };

  // Build tooltip content
  const getTooltipContent = (): string => {
    const parts: string[] = [];

    if (recency) {
      parts.push(`Last active: ${formatRelativeTime(recency.daysSince)}`);
      if (recency.lastDate) {
        parts.push(`Date: ${recency.lastDate.toLocaleDateString()}`);
      }
    }

    if (volume) {
      parts.push(`${volume.eventCount} events in ${volume.periodDays} days`);
      parts.push(formatVolumeDescription(volume.eventCount, volume.periodDays));
    }

    return parts.join("\n");
  };

  // Render minimal variant (just dots)
  if (variant === "minimal") {
    return (
      <div
        className={`inline-flex items-center gap-1 ${className}`}
        title={showTooltip ? getTooltipContent() : undefined}
      >
        <div
          className={`w-2 h-2 rounded-full ${getRecencyColor(recencyLevel)}`}
          aria-label="Recency indicator"
        />
        <div
          className={`w-2 h-2 rounded-full ${getVolumeColor(volumeLevel)}`}
          aria-label="Volume indicator"
        />
      </div>
    );
  }

  // Render detailed variant
  if (variant === "detailed") {
    return (
      <div className={`flex flex-col gap-2 p-2 ${className}`}>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 w-16">Recency:</span>
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <div
                  key={`r-${i}`}
                  className={`w-3 h-6 rounded-sm transition-all ${
                    i < recencyLevel
                      ? getRecencyColor(recencyLevel)
                      : "bg-gray-200"
                  }`}
                />
              ))}
            </div>
            {recency && (
              <span className="text-xs text-gray-500 ml-2">
                {formatRelativeTime(recency.daysSince)}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-600 w-16">Volume:</span>
          <div className="flex items-center gap-1">
            <div className="flex gap-0.5">
              {[...Array(5)].map((_, i) => (
                <div
                  key={`v-${i}`}
                  className={`w-3 h-6 rounded-sm transition-all ${
                    i < volumeLevel
                      ? getVolumeColor(volumeLevel)
                      : "bg-gray-200"
                  }`}
                />
              ))}
            </div>
            {volume && (
              <span className="text-xs text-gray-500 ml-2">
                {volume.eventCount} events
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Default compact variant
  return (
    <div
      className={`inline-flex items-center gap-1.5 ${className}`}
      title={showTooltip ? getTooltipContent() : undefined}
    >
      {/* Recency indicator */}
      <div className="flex items-center">
        <div className="flex gap-0.5">
          {[...Array(3)].map((_, i) => (
            <div
              key={`r-${i}`}
              className={`w-1.5 h-4 rounded-sm transition-all ${
                i < Math.ceil(recencyLevel / 2)
                  ? getRecencyColor(recencyLevel)
                  : "bg-gray-200"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Separator */}
      <div className="w-px h-4 bg-gray-300" />

      {/* Volume indicator */}
      <div className="flex items-center">
        <div className="flex gap-0.5">
          {[...Array(3)].map((_, i) => (
            <div
              key={`v-${i}`}
              className={`w-1.5 h-4 rounded-sm transition-all ${
                i < Math.ceil(volumeLevel / 2)
                  ? getVolumeColor(volumeLevel)
                  : "bg-gray-200"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Optional text labels */}
      {(recency || volume) && (
        <div className="flex items-center gap-2 ml-1">
          {recency && recencyLevel > 3 && (
            <span className="text-xs font-medium text-orange-600">Active</span>
          )}
          {volume && volumeLevel > 3 && (
            <span className="text-xs font-medium text-purple-600">Busy</span>
          )}
        </div>
      )}
    </div>
  );
};

export default ActivityIndicator;
