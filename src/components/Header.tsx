import React from 'react';
import { Outlet, Link } from 'react-router-dom';
import Container from 'react-bootstrap/Container';
import Nav from 'react-bootstrap/Nav';
import Navbar from 'react-bootstrap/Navbar';
import NavDropdown from 'react-bootstrap/NavDropdown';
import Breadcrumb from 'react-bootstrap/Breadcrumb';
import { useLocation } from 'react-router-dom';
import Logo from '../assets/res.svg';

const Header = () => {
  const loc = useLocation();
  const { hash, pathname, search } = loc;
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
        <Navbar.Brand href="/">
          <img src={Logo} alt="quantus logo" style={{width: '0.8em', marginRight: '0.3em'}} />
          qsafe.af
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav>
            <Nav.Link href="/">
              link
            </Nav.Link>
            <NavDropdown title="chains" id="basic-nav-dropdown">
              <NavDropdown.Item href="/chains/quantus">
                quantus
              </NavDropdown.Item>
              <NavDropdown.Divider />
              <NavDropdown.Item href="/chains/resonance">
                resonance (testnet)
              </NavDropdown.Item>
              <NavDropdown.Item href="/chains/integration">
                integration (testnet)
              </NavDropdown.Item>
            </NavDropdown>
          </Nav>
        </Navbar.Collapse>
      </Navbar>
      <Breadcrumb>
        <Breadcrumb.Item href="/">
          dashboard
        </Breadcrumb.Item>
        {
          ((!!crumbs && !!crumbs.length))
            ? crumbs.map((crumb, cI) => (
                <Breadcrumb.Item key={cI} href={crumb.path}>
                  {crumb.name}
                </Breadcrumb.Item>
              ))
            : null
        }
      </Breadcrumb>
      <Outlet/>
    </Container>
  );
};

export default Header;
