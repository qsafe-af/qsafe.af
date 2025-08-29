import React, { useEffect, useState } from "react";
import "./ProjectActivity.css";

interface ProjectActivityProps {
  url: string;
  periodDays?: number; // Time period for volume calculation (default: 30 days)
  onActivityLoaded?: (date: Date | undefined) => void; // Optional callback when activity is loaded
}

interface ActivityMetrics {
  lastActivityDate?: Date;
  eventCount?: number;
  hasMoreEvents?: boolean; // True if we hit the API page limit
  loading: boolean;
  error?: string;
}

interface CacheEntry {
  metrics: ActivityMetrics;
  timestamp: number;
}

// Cache for activity metrics
const activityCache: Map<string, CacheEntry> = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes cache

// Get GitHub token from environment (only for development)
const getGitHubToken = (): string | undefined => {
  // Only use token in development
  if (import.meta.env.DEV && import.meta.env.VITE_GITHUB_TOKEN) {
    console.log("Using GitHub token for development");
    return import.meta.env.VITE_GITHUB_TOKEN;
  }
  return undefined;
};

const ProjectActivity: React.FC<ProjectActivityProps> = ({
  url,
  periodDays = 30,
  onActivityLoaded,
}) => {
  const [metrics, setMetrics] = useState<ActivityMetrics>({
    loading: true,
  });

  useEffect(() => {
    const cacheKey = `${url}-${periodDays}`;

    // Check cache first
    const cached = activityCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`Using cached activity data for ${url}`);
      setMetrics(cached.metrics);
      return;
    }

    const fetchGitHubMetrics = async (parts: string[], startDate: Date) => {
      const isOrg = parts.length === 1;

      try {
        // Fetch recent events
        const endpoint = isOrg
          ? `https://cf-gh-proxy.snapr.workers.dev/org/${parts[0]}/events?per_page=100`
          : `https://cf-gh-proxy.snapr.workers.dev/repo/${parts.join("/")}/events?per_page=100`;

        console.log(`Fetching GitHub activity from: ${endpoint}`);

        const headers: HeadersInit = {
          Accept: "application/vnd.github.v3+json",
        };

        // Add GitHub token if available (dev only)
        const token = getGitHubToken();
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(endpoint, { headers });

        if (!response.ok) {
          const errorText =
            response.status === 404
              ? "Repository not found"
              : response.status === 403
                ? "API rate limit exceeded"
                : `HTTP ${response.status}`;
          throw new Error(`GitHub API error: ${errorText}`);
        }

        const events = await response.json();

        // Calculate metrics
        let lastActivityDate: Date | undefined;
        let eventCount = 0;
        let hasMoreEvents = false;

        if (events && events.length > 0) {
          lastActivityDate = new Date(events[0].created_at);

          // Count events within the period
          events.forEach((event: any) => {
            const eventDate = new Date(event.created_at);
            if (eventDate >= startDate) {
              eventCount++;
            }
          });

          // If we got 100 events (page limit), there are likely more
          hasMoreEvents = events.length === 100;
        }

        const newMetrics = {
          lastActivityDate,
          eventCount,
          hasMoreEvents,
          loading: false,
        };

        // Cache the result
        activityCache.set(cacheKey, {
          metrics: newMetrics,
          timestamp: Date.now(),
        });

        setMetrics(newMetrics);

        // Report activity date if callback provided
        if (onActivityLoaded) {
          onActivityLoaded(lastActivityDate);
        }
      } catch (err) {
        console.error("GitHub API error:", err);
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to fetch GitHub activity";
        const errorMetrics = {
          loading: false,
          error: errorMessage,
        };

        // Cache even errors to avoid repeated failed requests
        activityCache.set(cacheKey, {
          metrics: errorMetrics,
          timestamp: Date.now(),
        });

        setMetrics(errorMetrics);

        // Report no activity if error
        if (onActivityLoaded) {
          onActivityLoaded(undefined);
        }
      }
    };

    const fetchGitLabMetrics = async (
      hostname: string,
      path: string,
      startDate: Date,
    ) => {
      try {
        const parts = path.split("/");
        const isGroup = parts.length === 1;

        // Construct the proper GitLab API base URL
        const apiBase = hostname.includes("gitlab.com")
          ? "https://gitlab.com/api/v4"
          : `https://${hostname}/api/v4`;

        if (isGroup) {
          // For groups, get the group's projects
          const groupPath = encodeURIComponent(parts[0]);
          const groupUrl = `${apiBase}/groups/${groupPath}/projects?order_by=last_activity_at&sort=desc&per_page=10`;
          console.log(`Fetching GitLab group activity from: ${groupUrl}`);

          const response = await fetch(groupUrl, {
            headers: {
              Accept: "application/json",
            },
          });

          if (!response.ok) {
            throw new Error(`GitLab API error: ${response.status}`);
          }

          const projects = await response.json();

          if (projects && projects.length > 0) {
            // Use the most recently active project as a proxy for group activity
            const mostRecentProject = projects[0];
            const lastActivityDate = new Date(
              mostRecentProject.last_activity_at,
            );

            // For volume, we'll estimate based on project count and recent updates
            let recentlyActiveCount = 0;
            projects.forEach((project: any) => {
              const activityDate = new Date(project.last_activity_at);
              if (activityDate >= startDate) {
                recentlyActiveCount++;
              }
            });

            const newMetrics = {
              lastActivityDate,
              eventCount: recentlyActiveCount * 10, // Rough estimate
              hasMoreEvents: projects.length >= 10, // We only checked top 10 projects
              loading: false,
            };

            // Cache the result
            activityCache.set(cacheKey, {
              metrics: newMetrics,
              timestamp: Date.now(),
            });

            setMetrics(newMetrics);

            // Report activity date if callback provided
            if (onActivityLoaded) {
              onActivityLoaded(lastActivityDate);
            }
          } else {
            const newMetrics = {
              loading: false,
              eventCount: 0,
            };

            activityCache.set(cacheKey, {
              metrics: newMetrics,
              timestamp: Date.now(),
            });

            setMetrics(newMetrics);

            // Report no activity
            if (onActivityLoaded) {
              onActivityLoaded(undefined);
            }
          }
        } else {
          // For individual projects
          const projectPath = encodeURIComponent(parts.join("/"));
          const projectUrl = `${apiBase}/projects/${projectPath}`;
          console.log(`Fetching GitLab project activity from: ${projectUrl}`);

          // Get project info
          const response = await fetch(projectUrl, {
            headers: {
              Accept: "application/json",
            },
          });

          if (!response.ok) {
            throw new Error(`GitLab API error: ${response.status}`);
          }

          const project = await response.json();

          if (project) {
            const lastActivityDate = new Date(project.last_activity_at);

            // Try to get events (may fail due to permissions)
            try {
              const eventsResponse = await fetch(
                `${apiBase}/projects/${project.id}/events?after=${startDate.toISOString().split("T")[0]}&per_page=100`,
                {
                  headers: {
                    Accept: "application/json",
                  },
                },
              );

              let eventCount = 0;
              let hasMoreEvents = false;
              if (eventsResponse.ok) {
                const events = await eventsResponse.json();
                eventCount = events.length;
                hasMoreEvents = events.length === 100; // Hit page limit
              } else {
                // If events fail, estimate based on commit count
                const commitsResponse = await fetch(
                  `${apiBase}/projects/${project.id}/repository/commits?since=${startDate.toISOString()}&per_page=100`,
                  {
                    headers: {
                      Accept: "application/json",
                    },
                  },
                );

                if (commitsResponse.ok) {
                  const commits = await commitsResponse.json();
                  eventCount = commits.length;
                  hasMoreEvents = commits.length === 100; // Hit page limit
                }
              }

              const newMetrics = {
                lastActivityDate,
                eventCount,
                hasMoreEvents,
                loading: false,
              };

              // Cache the result
              activityCache.set(cacheKey, {
                metrics: newMetrics,
                timestamp: Date.now(),
              });

              setMetrics(newMetrics);

              // Report activity date if callback provided
              if (onActivityLoaded) {
                onActivityLoaded(lastActivityDate);
              }
            } catch {
              // If we can't get events, just use the last activity date
              const newMetrics = {
                lastActivityDate,
                eventCount: 0,
                loading: false,
              };

              activityCache.set(cacheKey, {
                metrics: newMetrics,
                timestamp: Date.now(),
              });

              setMetrics(newMetrics);

              // Report activity date if callback provided
              if (onActivityLoaded) {
                onActivityLoaded(lastActivityDate);
              }
            }
          }
        }
      } catch (err) {
        console.error("GitLab API error:", err);
        const errorMessage =
          err instanceof Error
            ? err.message
            : "Failed to fetch GitLab activity";
        const errorMetrics = {
          loading: false,
          error: errorMessage,
        };

        // Cache even errors
        activityCache.set(cacheKey, {
          metrics: errorMetrics,
          timestamp: Date.now(),
        });

        setMetrics(errorMetrics);

        // Report no activity if error
        if (onActivityLoaded) {
          onActivityLoaded(undefined);
        }
      }
    };

    const fetchActivityMetrics = async () => {
      try {
        setMetrics({ loading: true, error: undefined });

        const urlParts = new URL(url);
        const hostname = urlParts.hostname;
        const cleanPath = urlParts.pathname.replace(/^\/|\/$/g, "");
        const parts = cleanPath.split("/");

        // Calculate the date range for volume metrics
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - periodDays);

        console.log(`Processing activity for URL: ${url}`);
        console.log(`Hostname: ${hostname}, Path parts:`, parts);

        if (hostname.includes("github")) {
          await fetchGitHubMetrics(parts, startDate);
        } else if (hostname.includes("gitlab")) {
          await fetchGitLabMetrics(hostname, cleanPath, startDate);
        } else {
          const errorMetrics = {
            loading: false,
            error: "Unsupported platform",
          };

          activityCache.set(cacheKey, {
            metrics: errorMetrics,
            timestamp: Date.now(),
          });

          setMetrics(errorMetrics);

          // Report no activity for unsupported platform
          if (onActivityLoaded) {
            onActivityLoaded(undefined);
          }
        }
      } catch (err) {
        console.error("Error fetching activity metrics:", err);
        const errorMetrics = {
          loading: false,
          error:
            err instanceof Error ? err.message : "Failed to fetch activity",
        };

        activityCache.set(cacheKey, {
          metrics: errorMetrics,
          timestamp: Date.now(),
        });

        setMetrics(errorMetrics);

        // Report error as no activity
        if (onActivityLoaded) {
          onActivityLoaded(undefined);
        }
      }
    };

    fetchActivityMetrics();
  }, [url, periodDays]);

  // Calculate visual indicators
  const getRecencyIndicator = () => {
    if (!metrics.lastActivityDate) return "⏸️";

    const daysSince = Math.floor(
      (new Date().getTime() - metrics.lastActivityDate.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    if (daysSince === 0) return "🔥"; // Today
    if (daysSince <= 1) return "✨"; // Yesterday
    if (daysSince <= 7) return "🚀"; // This week
    if (daysSince <= 30) return "📅"; // This month
    if (daysSince <= 90) return "🕐"; // This quarter
    return "💤"; // Dormant
  };

  const getVolumeIndicator = () => {
    if (metrics.eventCount === undefined) return "";

    const eventsPerDay = metrics.eventCount / periodDays;

    if (eventsPerDay >= 10) return "🌊"; // Very high
    if (eventsPerDay >= 5) return "💪"; // High
    if (eventsPerDay >= 1) return "📈"; // Moderate
    if (eventsPerDay >= 0.3) return "📉"; // Low
    if (metrics.eventCount > 0) return "🐢"; // Very low
    return "🦥"; // None
  };

  if (metrics.loading) {
    return <span className="text-muted">⏳</span>;
  }

  if (metrics.error) {
    console.warn(`Activity fetch error for ${url}: ${metrics.error}`);
    return (
      <span
        className="text-warning"
        title={metrics.error}
        style={{ cursor: "help" }}
      >
        ⚠️{" "}
        <span className="text-muted small">
          {metrics.error.includes("rate limit") ? "rate limit" : "error"}
        </span>
      </span>
    );
  }

  const daysSince = metrics.lastActivityDate
    ? Math.floor(
        (new Date().getTime() - metrics.lastActivityDate.getTime()) /
          (1000 * 60 * 60 * 24),
      )
    : null;

  const tooltipText = [
    daysSince !== null
      ? `Last active: ${daysSince === 0 ? "Today" : daysSince === 1 ? "Yesterday" : `${daysSince} days ago`}`
      : "",
    metrics.eventCount !== undefined
      ? `Activity: ${metrics.hasMoreEvents ? `${metrics.eventCount}+` : metrics.eventCount} events in ${periodDays} days`
      : "",
    metrics.lastActivityDate
      ? `Date: ${metrics.lastActivityDate.toLocaleDateString()}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <span className="activity-indicators" title={tooltipText}>
      <span className="activity-recency">{getRecencyIndicator()}</span>
      <span className="activity-volume">{getVolumeIndicator()}</span>
      {metrics.eventCount !== undefined && metrics.eventCount > 0 && (
        <span className="activity-count text-muted small">
          (
          {metrics.hasMoreEvents
            ? `${metrics.eventCount}+`
            : metrics.eventCount}
          )
        </span>
      )}
    </span>
  );
};

// Export cache clear function for development/debugging
export const clearActivityCache = () => {
  activityCache.clear();
  console.log("Activity cache cleared");
};

export default ProjectActivity;
