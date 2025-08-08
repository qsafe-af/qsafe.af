import { Outlet } from "react-router-dom";
import Container from "react-bootstrap/Container";
import Nav from "react-bootstrap/Nav";
import Navbar from "react-bootstrap/Navbar";
import NavDropdown from "react-bootstrap/NavDropdown";
import Breadcrumb from "react-bootstrap/Breadcrumb";
import Dropdown from "react-bootstrap/Dropdown";
import { useLocation, useNavigate } from "react-router-dom";
import Logo from "./assets/res.svg";
import ThemeToggle from "./ThemeToggle";
import { getAllChains } from "./chains";
import "./Header.css";

const Header = () => {
  const loc = useLocation();
  const navigate = useNavigate();
  const { pathname } = loc;
  const segments = pathname.split("/").filter((c) => !!c);

  // Transform segments to show friendly names for chains
  const crumbs = segments.map((segment, i) => {
    return {
      name: segment,
      path: `/${segments.slice(0, i + 1).join("/")}`,
    };
  });

  const chains = getAllChains();

  return (
    <Container>
      <Navbar expand="lg">
        <Navbar.Brand href="/chains">
          <img
            src={Logo}
            alt="quantus logo"
            style={{ width: "0.8em", marginRight: "0.3em" }}
          />
          qsafe.af
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav>
            <Nav.Link href="https://github.com/qsafe-af/qsafe.af">
              <i className="bi bi-github"></i>
            </Nav.Link>
            <NavDropdown title="chains" id="basic-nav-dropdown">
              {chains.map((chain) => (
                <NavDropdown.Item
                  key={chain.name}
                  href={`/chains/${chain.name}/activity`}
                >
                  {chain.displayName}
                </NavDropdown.Item>
              ))}
              {chains.length === 0 && (
                <NavDropdown.Item disabled>
                  No chains configured
                </NavDropdown.Item>
              )}
            </NavDropdown>
          </Nav>
          <Nav className="ms-auto">
            <ThemeToggle />
          </Nav>
        </Navbar.Collapse>
      </Navbar>
      <Breadcrumb>
        {!!crumbs && !!crumbs.length
          ? crumbs.map((crumb, cI) => {
              if (cI === 0 && crumb.name === "chains") {
                // Show dropdown for chains
                return (
                  <Breadcrumb.Item key={cI}>
                    <Dropdown as="span" className="d-inline">
                      <Dropdown.Toggle
                        as="a"
                        className="text-decoration-none cursor-pointer"
                        style={{ cursor: "pointer" }}
                      >
                        chains
                      </Dropdown.Toggle>
                      <Dropdown.Menu>
                        {chains.map((chain) => (
                          <Dropdown.Item
                            key={chain.name}
                            onClick={() =>
                              navigate(`/chains/${chain.name}/activity`)
                            }
                          >
                            {chain.name}
                          </Dropdown.Item>
                        ))}
                      </Dropdown.Menu>
                    </Dropdown>
                  </Breadcrumb.Item>
                );
              }

              return crumbs.length === cI + 1 ? (
                <Breadcrumb.Item key={cI} active>
                  {crumb.name}
                </Breadcrumb.Item>
              ) : (
                <Breadcrumb.Item key={cI} href={crumb.path}>
                  {crumb.name}
                </Breadcrumb.Item>
              );
            })
          : null}
      </Breadcrumb>
      <Outlet />
    </Container>
  );
};

export default Header;
