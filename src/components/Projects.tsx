import React, { useEffect, useState } from "react";
import ProjectActivity from "./ProjectActivity";

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
  const [projects, setProjects] = useState<Project[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const response = await fetch("/chains/pq.json");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: { projects: Project[] } = await response.json();
        setProjects(data.projects);
      } catch (err: unknown) {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("An unknown error occurred.");
        }
      }
    };

    fetchProjects();
  }, []);

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div className="container">
      <h3>Quantum-Safe Crypto Radar</h3>
      <table className="table table-striped">
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Symbols</th>
            <th>Status</th>
            <th>Homepage</th>
            <th>Repo</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((project, index) => (
            <tr key={index}>
              <td>{index + 1}</td>
              <td>{project.name}</td>
              <td>{project.symbol}</td>
              <td>{project.status}</td>
              <td>
                <a
                  href={project.homepage}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {project.homepage}
                </a>
              </td>
              <td>
                <a
                  href={project.repo}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ marginRight: "8px" }}
                >
                  <i className={`bi bi-${selectIcon(project.repo)}`}></i>
                </a>
                <ProjectActivity url={project.repo} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default Projects;
