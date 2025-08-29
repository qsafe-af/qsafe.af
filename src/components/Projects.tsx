import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import ProjectActivity from "./ProjectActivity";
import "./Projects.css";

interface SignatureScheme {
  name: string;
  family: string;
  standard: string;
  nist_security_level: string;
  usage: string;
  sizes: {
    public_key: string;
    signature: string;
  };
}

interface Project {
  name: string;
  symbol: string;
  status: string;
  homepage: string;
  repo: string;
  signature_schemes: SignatureScheme[];
}

interface ProjectWithActivity extends Project {
  lastActivityDate?: Date;
  activityLoaded: boolean;
}

type SortMode = "activity" | "security" | "hybrid";

// Helper function to calculate security level for a scheme
const getSecurityLevel = (
  scheme: SignatureScheme,
): {
  level: number;
  color: string;
  label: string;
  icon: string;
} => {
  const standard = scheme.standard.toLowerCase();
  const level = scheme.nist_security_level.toLowerCase();
  const family = scheme.family.toLowerCase();

  // Check for FIPS compliance (highest security)
  if (
    standard.includes("fips 203") ||
    standard.includes("fips 204") ||
    standard.includes("fips 205")
  ) {
    if (level.includes("level 5") || level.includes("ml-dsa-87")) {
      return {
        level: 5,
        color: "#22c55e",
        label: "FIPS Level 5",
        icon: "🛡️",
      };
    } else if (level.includes("level 3")) {
      return {
        level: 4,
        color: "#3b82f6",
        label: "FIPS Level 3",
        icon: "🔒",
      };
    } else if (level.includes("level 2")) {
      return {
        level: 3,
        color: "#06b6d4",
        label: "FIPS Level 2",
        icon: "🔐",
      };
    } else {
      return {
        level: 3,
        color: "#0ea5e9",
        label: "FIPS Level 1",
        icon: "🔑",
      };
    }
  }

  // Check for RFC standards (good security)
  if (standard.includes("rfc")) {
    return { level: 3, color: "#8b5cf6", label: "RFC Standard", icon: "📋" };
  }

  // Hash-based signatures (proven security)
  if (family === "hash-based") {
    return { level: 3, color: "#a855f7", label: "Hash-based", icon: "🔗" };
  }

  // Lattice-based (modern)
  if (family === "lattice-based") {
    return { level: 3, color: "#6366f1", label: "Lattice-based", icon: "💎" };
  }

  // Default/Unknown
  return { level: 1, color: "#94a3b8", label: "Experimental", icon: "🧪" };
};

// Helper function to get project's overall security level
const getProjectSecurityLevel = (schemes: SignatureScheme[]): number => {
  if (schemes.length === 0) return 0;
  const levels = schemes.map(getSecurityLevel);
  return Math.max(...levels.map((l) => l.level));
};

// Security level indicator component
const SecurityIndicator: React.FC<{ schemes: SignatureScheme[] }> = ({
  schemes,
}) => {
  if (schemes.length === 0) {
    return <span className="text-muted">No PQ schemes</span>;
  }

  // Get the highest security level among all schemes
  const securityLevels = schemes.map(getSecurityLevel);
  const highestSecurity = securityLevels.reduce((max, curr) =>
    curr.level > max.level ? curr : max,
  );

  // Get signature size for the main scheme
  const mainScheme = schemes[0];
  const sigSize = mainScheme.sizes?.signature || "unknown";

  return (
    <div className="d-flex align-items-center gap-2">
      <span style={{ fontSize: "1.2em" }}>{highestSecurity.icon}</span>
      <div>
        <div>
          <small className="fw-bold" style={{ color: highestSecurity.color }}>
            {highestSecurity.label}
          </small>
        </div>
        <div>
          <small className="text-muted" style={{ fontSize: "0.75em" }}>
            {mainScheme.name}
          </small>
        </div>
        <div>
          <small className="text-muted" style={{ fontSize: "0.7em" }}>
            Sig: {sigSize} bytes
          </small>
        </div>
      </div>
      <div className="ms-auto">
        <div
          style={{
            width: "40px",
            height: "6px",
            backgroundColor: "#e5e7eb",
            borderRadius: "3px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${(highestSecurity.level / 5) * 100}%`,
              height: "100%",
              backgroundColor: highestSecurity.color,
              borderRadius: "3px",
            }}
          />
        </div>
      </div>
    </div>
  );
};

const selectIcon = (repo: string): string => {
  if (repo.includes("github")) {
    return "github";
  } else if (repo.includes("gitlab")) {
    return "gitlab";
  } else if (repo.includes("bitbucket")) {
    return "bitbucket";
  } else {
    return "git";
  }
};

const Projects: React.FC = () => {
  const [projects, setProjects] = useState<ProjectWithActivity[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activityDates, setActivityDates] = useState<
    Map<string, Date | undefined>
  >(new Map());
  const [sortMode, setSortMode] = useState<SortMode>("hybrid");
  const [markdownContent, setMarkdownContent] = useState<string>("");

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await fetch("/chains/pq.json");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: { projects: Project[] } = await response.json();

        // Initialize projects with activity tracking
        const projectsWithActivity: ProjectWithActivity[] = data.projects.map(
          (p) => ({
            ...p,
            activityLoaded: false,
          }),
        );

        setProjects(projectsWithActivity);
        setLoading(false);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred.");
        }
        setLoading(false);
      }
    };

    fetchProjects();
  }, []);

  // Fetch the markdown documentation
  useEffect(() => {
    const fetchMarkdown = async () => {
      try {
        const response = await fetch("/docs/post-quantum-standards.md");
        if (response.ok) {
          const text = await response.text();
          setMarkdownContent(text);
        }
      } catch (err) {
        console.warn("Failed to load documentation:", err);
      }
    };
    fetchMarkdown();
  }, []);

  // Handle activity date updates
  const handleActivityDate = (repo: string, date: Date | undefined) => {
    setActivityDates((prev) => {
      const newMap = new Map(prev);
      newMap.set(repo, date);
      return newMap;
    });
  };

  // Sort projects based on selected mode
  const sortedProjects = [...projects].sort((a, b) => {
    const dateA = activityDates.get(a.repo);
    const dateB = activityDates.get(b.repo);
    const securityA = getProjectSecurityLevel(a.signature_schemes);
    const securityB = getProjectSecurityLevel(b.signature_schemes);

    if (sortMode === "security") {
      // Primary sort by security level
      if (securityA !== securityB) {
        return securityB - securityA; // Higher security first
      }
      // Secondary sort by activity date
      if (dateA && dateB) {
        return dateB.getTime() - dateA.getTime();
      }
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;
      return 0;
    } else if (sortMode === "activity") {
      // Primary sort by activity date
      if (dateA && !dateB) return -1;
      if (!dateA && dateB) return 1;
      if (dateA && dateB) {
        return dateB.getTime() - dateA.getTime();
      }
      // Secondary sort by security level
      return securityB - securityA;
    } else {
      // hybrid mode
      // Balance security and activity
      // Projects with high security (level 4-5) get a boost
      const securityBoostA = securityA >= 4 ? 30 * 24 * 60 * 60 * 1000 : 0; // 30 days boost
      const securityBoostB = securityB >= 4 ? 30 * 24 * 60 * 60 * 1000 : 0;

      const effectiveDateA = dateA
        ? dateA.getTime() + securityBoostA
        : securityBoostA;
      const effectiveDateB = dateB
        ? dateB.getTime() + securityBoostB
        : securityBoostB;

      if (effectiveDateA !== effectiveDateB) {
        return effectiveDateB - effectiveDateA;
      }

      // Fallback to status
      const statusOrder = { active: 0, testnet: 1, partial: 2, historical: 3 };
      const orderA = statusOrder[a.status as keyof typeof statusOrder] ?? 4;
      const orderB = statusOrder[b.status as keyof typeof statusOrder] ?? 4;
      return orderA - orderB;
    }
  });

  if (error) {
    return <div className="alert alert-danger">Error: {error}</div>;
  }

  if (loading) {
    return (
      <div className="container">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h3>quantum safe project radar</h3>
          <div className="btn-group btn-group-sm" role="group">
            <button
              type="button"
              className={`btn ${sortMode === "hybrid" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setSortMode("hybrid")}
              title="Balance security and activity"
            >
              Balanced
            </button>
            <button
              type="button"
              className={`btn ${sortMode === "activity" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setSortMode("activity")}
              title="Sort by most recent activity"
            >
              Activity
            </button>
            <button
              type="button"
              className={`btn ${sortMode === "security" ? "btn-primary" : "btn-outline-primary"}`}
              onClick={() => setSortMode("security")}
              title="Sort by security level"
            >
              Security
            </button>
          </div>
        </div>
        <div className="text-center p-5">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h3>quantum safe project radar</h3>
        <div className="btn-group btn-group-sm" role="group">
          <button
            type="button"
            className={`btn ${sortMode === "hybrid" ? "btn-primary" : "btn-outline-primary"}`}
            onClick={() => setSortMode("hybrid")}
            title="Balance security and activity"
          >
            Balanced
          </button>
          <button
            type="button"
            className={`btn ${sortMode === "activity" ? "btn-primary" : "btn-outline-primary"}`}
            onClick={() => setSortMode("activity")}
            title="Sort by most recent activity"
          >
            Activity
          </button>
          <button
            type="button"
            className={`btn ${sortMode === "security" ? "btn-primary" : "btn-outline-primary"}`}
            onClick={() => setSortMode("security")}
            title="Sort by security level"
          >
            Security
          </button>
        </div>
      </div>
      <table className="table table-striped">
        <thead>
          <tr>
            <th style={{ width: "30%" }}>Project</th>
            <th style={{ width: "15%" }}>Status</th>
            <th style={{ width: "35%" }}>Quantum Security</th>
            <th style={{ width: "20%" }}>Repository</th>
          </tr>
        </thead>
        <tbody>
          {sortedProjects.map((project, index) => (
            <tr key={`${project.repo}-${index}`}>
              <td>
                <div>
                  <a
                    href={project.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="project-name-link"
                  >
                    {project.name}
                  </a>
                  <span className="badge bg-secondary ms-2">
                    {project.symbol}
                  </span>
                </div>
              </td>
              <td>
                <span
                  className={`badge ${
                    project.status === "active"
                      ? "bg-success"
                      : project.status === "testnet"
                        ? "bg-warning text-dark"
                        : project.status === "partial"
                          ? "bg-info"
                          : "bg-secondary"
                  }`}
                >
                  {project.status}
                </span>
              </td>
              <td>
                <SecurityIndicator schemes={project.signature_schemes} />
              </td>
              <td>
                <div className="d-flex align-items-center gap-2">
                  <a
                    href={project.repo}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <i className={`bi bi-${selectIcon(project.repo)}`}></i>
                  </a>
                  <ProjectActivity
                    url={project.repo}
                    periodDays={30}
                    onActivityLoaded={(date) =>
                      handleActivityDate(project.repo, date)
                    }
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Render markdown documentation */}
      {markdownContent && (
        <div className="mt-5 p-4 rounded markdown-wrapper">
          <div className="markdown-content">
            <ReactMarkdown
              components={{
                h1: ({ children }) => (
                  <h2 className="h4 mt-4 mb-3">{children}</h2>
                ),
                h2: ({ children }) => (
                  <h3 className="h5 mt-3 mb-2">{children}</h3>
                ),
                h3: ({ children }) => (
                  <h4 className="h6 mt-2 mb-2">{children}</h4>
                ),
                p: ({ children }) => <p className="mb-2">{children}</p>,
                ul: ({ children }) => <ul className="mb-3">{children}</ul>,
                li: ({ children }) => <li className="ms-3">{children}</li>,
                hr: () => <hr className="my-3" />,
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer">
                    {children}
                  </a>
                ),
              }}
            >
              {markdownContent}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
};

export default Projects;
