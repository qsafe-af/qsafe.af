import React, { useEffect, useState } from "react";

interface ProjectActivityProps {
  url: string;
}

const ProjectActivity: React.FC<ProjectActivityProps> = ({ url }) => {
  const [activityInfo, setActivityInfo] = useState<{
    lastActivityDate?: Date;
    eventFrequency?: number;
  }>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const urlParts = new URL(url);
        const hostname = urlParts.hostname;

        // Check if it's a GitHub URL
        if (hostname.startsWith("github")) {
          const cleanPath = urlParts.pathname.replace(/^\/|\/$/g, "");
          const parts = cleanPath.split("/");
          const isOrg = parts.length === 1;

          if (isOrg) {
            // Get the most recent org event
            const eventsResponse = await fetch(
              `https://api.github.com/orgs/${parts[0]}/events`,
              {
                headers: {
                  Accept: "application/vnd.github.v3+json",
                },
              },
            );

            if (!eventsResponse.ok) {
              throw new Error(`HTTP error! status: ${eventsResponse.status}`);
            }

            const eventsData = await eventsResponse.json();
            const latestEvent = eventsData[0];
            if (latestEvent) {
              setActivityInfo({
                ...activityInfo,
                lastActivityDate: new Date(latestEvent.created_at),
              });
            }
          } else {
            // Get the most recent repo event
            const eventsResponse = await fetch(
              `https://api.github.com/repos/${parts.join("/")}/events`,
              {
                headers: {
                  Accept: "application/vnd.github.v3+json",
                },
              },
            );

            if (!eventsResponse.ok) {
              throw new Error(`HTTP error! status: ${eventsResponse.status}`);
            }

            const eventsData = await eventsResponse.json();
            const latestEvent = eventsData[0];
            if (latestEvent) {
              setActivityInfo({
                ...activityInfo,
                lastActivityDate: new Date(latestEvent.created_at),
              });
            }
          }
        }
        // Check if it's a GitLab URL
        else if (hostname.startsWith("gitlab")) {
          const cleanPath = urlParts.pathname.replace(/^\/|\/$/g, "");
          const parts = cleanPath.split("/");
          const isOrg = parts.length === 1;

          const gitlabApiUrl = isOrg
            ? `${url}/api/v4/projects?per_page=1&order_by=updated_at&sort=desc`
            : `${url}/api/v4/projects/${parts.join("/")}?per_page=1&order_by=updated_at&sort=desc`;

          const eventsResponse = await fetch(gitlabApiUrl, {
            headers: {
              Accept: "application/json",
            },
          });

          if (!eventsResponse.ok) {
            throw new Error(`HTTP error! status: ${eventsResponse.status}`);
          }

          const eventsData = await eventsResponse.json();
          const latestEvent = eventsData[0];
          if (latestEvent) {
            setActivityInfo({
              ...activityInfo,
              lastActivityDate: new Date(latestEvent.updated_at),
            });
          }
        } else {
          return; // Unsupported URL, do nothing
        }
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred.");
        }
      }
    };

    fetchData();
  }, [url]);

  if (error) {
    return <div>Error: {error}</div>;
  }

  if (!activityInfo.lastActivityDate) {
    return null; // No data available yet
  }

  // Calculate the time since the last activity
  const timeSinceLastActivity =
    new Date().getTime() - activityInfo.lastActivityDate.getTime();

  // Convert time difference to days
  const daysSinceLastActivity = Math.floor(
    timeSinceLastActivity / (1000 * 60 * 60 * 24),
  );

  // Define the event frequency indicator
  const eventFrequencyIndicator = (
    <span title={`Last activity ${daysSinceLastActivity} days ago`}>
      {daysSinceLastActivity <= 1
        ? "🔥"
        : daysSinceLastActivity <= 7
          ? "🚀"
          : "⏰"}
    </span>
  );

  return <div>{eventFrequencyIndicator}</div>;
};

export default ProjectActivity;
