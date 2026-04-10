import React from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Header,
  HeaderName,
  HeaderNavigation,
  HeaderMenuItem,
  HeaderGlobalBar,
  HeaderGlobalAction,
  SideNav,
  SideNavItems,
  SideNavLink,
  Content,
  Theme,
} from '@carbon/react';
import {
  Dashboard,
  Flow,
  Upload,
  DocumentView,
  DataBase,
  Security,
  Chat,
  Settings,
  Logout,
  Login,
} from '@carbon/icons-react';
import { useAuthStore } from '../store/authStore';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: Dashboard },
  { path: '/workflows', label: 'Workflows', icon: Flow },
  { path: '/upload', label: 'Upload', icon: Upload },
  { path: '/review', label: 'Review', icon: DocumentView },
  { path: '/repository', label: 'Repository', icon: DataBase },
  { path: '/compliance', label: 'Compliance', icon: Security },
  { path: '/chat', label: 'Chat', icon: Chat },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const AppShell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <Theme theme="white" className="docproc-app">
      <Header aria-label="DocProc">
        <HeaderName href="/" prefix="">
          <img
            src="/logo-icon.png"
            alt="DocProc"
            style={{ height: 26, marginRight: 6, verticalAlign: 'middle' }}
          />
          DocProc
        </HeaderName>
        <HeaderNavigation aria-label="DocProc Navigation">
          <HeaderMenuItem href="/workflows">Workflows</HeaderMenuItem>
          <HeaderMenuItem href="/upload">Upload</HeaderMenuItem>
        </HeaderNavigation>
        <HeaderGlobalBar>
          {isAuthenticated && user ? (
            <>
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: '#161616',
                  fontSize: '0.875rem',
                  fontWeight: 400,
                  marginRight: 8,
                }}
              >
                {user.full_name}
              </span>
              <HeaderGlobalAction
                aria-label="Logout"
                onClick={handleLogout}
              >
                <Logout size={20} />
              </HeaderGlobalAction>
            </>
          ) : (
            <HeaderGlobalAction
              aria-label="Login"
              onClick={() => navigate('/login')}
            >
              <Login size={20} />
            </HeaderGlobalAction>
          )}
        </HeaderGlobalBar>
      </Header>

      <SideNav
        aria-label="Side navigation"
        isRail={false}
        expanded
        isFixedNav
      >
        <SideNavItems>
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
            <SideNavLink
              key={path}
              renderIcon={Icon}
              onClick={() => navigate(path)}
              isActive={location.pathname === path}
            >
              {label}
            </SideNavLink>
          ))}
        </SideNavItems>
      </SideNav>

      <Content className="docproc-content">
        <Outlet />
      </Content>
    </Theme>
  );
};

export default AppShell;
