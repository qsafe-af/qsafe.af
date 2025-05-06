import { Outlet } from 'react-router-dom';
import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import NavDropdown from 'react-bootstrap/NavDropdown';
import Breadcrumb from 'react-bootstrap/Breadcrumb';
import { useLocation } from 'react-router-dom';
import Logo from '../assets/res.svg';

const Header = () => {
  const loc = useLocation();
  const { pathname } = loc;
  const x = pathname.split('/').filter((c) => !!c);
  const crumbs = x.map((c, i) => (
    {
      name: c,
      path: `/${x.slice(0, (i + 1)).join('/')}`
    }
  ));
  return (
    <Container>
      <Navbar expand="lg">
        <Navbar.Brand href="/chains">
          <img src={Logo} alt="quantus logo" style={{width: '0.8em', marginRight: '0.3em'}} />
          qsafe.af
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav>
            <Nav.Link href="https://github.com/qsafe-af/qsafe.af">
              <i className="bi bi-github"></i>
            </Nav.Link>
            <NavDropdown title="chains" id="basic-nav-dropdown">
              <NavDropdown.Item href="/chains/quantus">
                quantus
              </NavDropdown.Item>
              <NavDropdown.Divider />
              <NavDropdown.Item href="/chains/resonance">
                resonance
              </NavDropdown.Item>
              <NavDropdown.Item href="/chains/integration">
                integration
              </NavDropdown.Item>
            </NavDropdown>
          </Nav>
        </Navbar.Collapse>
      </Navbar>
      <Breadcrumb>
        {
          ((!!crumbs && !!crumbs.length))
            ? crumbs.map((crumb, cI) => (
                (crumbs.length === (cI + 1))
                  ? (
                      <Breadcrumb.Item key={cI} active>
                        {crumb.name}
                      </Breadcrumb.Item>
                    )
                  : (
                      <Breadcrumb.Item key={cI} href={crumb.path}>
                        {crumb.name}
                      </Breadcrumb.Item>
                    )
              ))
            : null
        }
      </Breadcrumb>
      <Outlet/>
    </Container>
  );
};

export default Header;
