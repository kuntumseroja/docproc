import React, { useState } from 'react';
import {
  Button,
  TextInput,
  Tile,
  InlineNotification,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
} from '@carbon/react';
import { Login } from '@carbon/icons-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import api from '../services/api';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  // Login state
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register state
  const [regEmail, setRegEmail] = useState('');
  const [regName, setRegName] = useState('');
  const [regPassword, setRegPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/auth/login', {
        email: loginEmail,
        password: loginPassword,
      });
      const token = res.data.access_token;
      // Fetch user profile
      const meRes = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAuth(meRes.data, token);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await api.post('/auth/register', {
        email: regEmail,
        full_name: regName,
        password: regPassword,
      });
      // Auto-login after registration
      const res = await api.post('/auth/login', {
        email: regEmail,
        password: regPassword,
      });
      const token = res.data.access_token;
      const meRes = await api.get('/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      setAuth(meRes.data, token);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #D0E2FF 0%, #EDF5FF 50%, #FFFFFF 100%)',
      }}
    >
      <div style={{ width: 400 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img
            src="/logo-docproc.png"
            alt="DocProc"
            style={{ height: 72, objectFit: 'contain' }}
          />
          <p
            style={{
              marginTop: 8,
              fontSize: '0.8rem',
              fontWeight: 300,
              color: '#525252',
              letterSpacing: '0.5px',
            }}
          >
            IBM Consulting HCD Indonesia
          </p>
        </div>

        {error && (
          <InlineNotification
            kind="error"
            title={error}
            onClose={() => setError(null)}
            style={{ marginBottom: 16 }}
          />
        )}

        <Tile style={{ padding: 32 }}>
          <Tabs>
            <TabList aria-label="Auth tabs">
              <Tab>Sign In</Tab>
              <Tab>Register</Tab>
            </TabList>
            <TabPanels>
              <TabPanel>
                <form onSubmit={handleLogin}>
                  <TextInput
                    id="login-email"
                    labelText="Email"
                    type="email"
                    value={loginEmail}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLoginEmail(e.target.value)}
                    required
                    style={{ marginBottom: 16 }}
                  />
                  <TextInput
                    id="login-password"
                    labelText="Password"
                    type="password"
                    value={loginPassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLoginPassword(e.target.value)}
                    required
                    style={{ marginBottom: 24 }}
                  />
                  <Button
                    type="submit"
                    kind="primary"
                    renderIcon={Login}
                    disabled={loading}
                    style={{ width: '100%' }}
                  >
                    {loading ? 'Signing in...' : 'Sign In'}
                  </Button>
                </form>
              </TabPanel>
              <TabPanel>
                <form onSubmit={handleRegister}>
                  <TextInput
                    id="reg-name"
                    labelText="Full Name"
                    value={regName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRegName(e.target.value)}
                    required
                    style={{ marginBottom: 16 }}
                  />
                  <TextInput
                    id="reg-email"
                    labelText="Email"
                    type="email"
                    value={regEmail}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRegEmail(e.target.value)}
                    required
                    style={{ marginBottom: 16 }}
                  />
                  <TextInput
                    id="reg-password"
                    labelText="Password"
                    type="password"
                    value={regPassword}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRegPassword(e.target.value)}
                    required
                    style={{ marginBottom: 24 }}
                  />
                  <Button
                    type="submit"
                    kind="primary"
                    disabled={loading}
                    style={{ width: '100%' }}
                  >
                    {loading ? 'Creating account...' : 'Create Account'}
                  </Button>
                </form>
              </TabPanel>
            </TabPanels>
          </Tabs>
        </Tile>
      </div>
    </div>
  );
};

export default LoginPage;
