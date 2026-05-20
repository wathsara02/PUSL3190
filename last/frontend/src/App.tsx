import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Home from './pages/Home';
import Auth from './pages/Auth';
import AuthCallback from './pages/AuthCallback';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
import Rules from './pages/Rules';
import History from './pages/History';
import Lobby from './pages/Lobby';
import Room from './pages/Room';
import Game from './pages/Game';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Auth mode="login" />} />
        <Route path="/signup" element={<Auth mode="signup" />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/how-to-play" element={<Rules />} />
        <Route path="/history" element={<History />} />
        <Route path="/play" element={<Lobby />} />
        <Route path="/room/:roomId" element={<Room />} />
        <Route path="/game/:roomId" element={<Game />} />
      </Routes>
    </Router>
  );
}

export default App;
