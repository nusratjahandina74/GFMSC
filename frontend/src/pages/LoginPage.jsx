import { useState, useContext } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import API from '../services/api';
import { AuthContext } from '../App';

export default function LoginPage() {
  const navigate = useNavigate();
  const { setUser } = useContext(AuthContext);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await API.post('/auth/login', { email, password });
      
      // Safely parse tokens across multiple object variations
      const token = response.data?.token || response.data?.data?.token || response.data?.accessToken;
      const user = response.data?.user || response.data?.data?.user;
      const role = response.data?.role || user?.role || 'admin';

      if (token) {
        // Clear any stale session from a previous account FIRST. Without
        // this, if a response ever omitted `user`, the old localStorage
        // 'user' entry would silently survive and the UI would keep
        // showing the previous account's name after a fresh login.
        localStorage.removeItem('token');
        localStorage.removeItem('role');
        localStorage.removeItem('user');

        localStorage.setItem('token', token);
        localStorage.setItem('role', role);
        if (user) {
          localStorage.setItem('user', JSON.stringify(user));
          setUser(user);
        }

        // Route to the correct landing page for this user's actual role.
        // Hardcoding '/admin/dashboard' here would send teachers/students
        // into a route guarded for schoolAdmin/superAdmin only, bouncing
        // them straight to /unauthorized right after a successful login.
        if (role === 'schoolAdmin' || role === 'superAdmin') {
          navigate('/admin/dashboard');
        } else if (role === 'teacher') {
          navigate('/dashboard/teacher');
        } else if (role === 'student') {
          navigate('/dashboard/student');
        } else if (role === 'staff') {
          navigate('/dashboard/staff-portal');
        } else {
          navigate('/dashboard');
        }
      } else {
        setError('Parsing Failure: Server authenticated request but returned an invalid token footprint.');
      }
    } catch (err) {
      if (!err.response) {
        setError('Server Wake-up Notice: Render cloud backend is cold-starting or unreachable. Please wait 1 minute and try again.');
      } else {
        setError(err.response.data?.message || 'Invalid credentials!');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <div className="mb-4">
            <img
              src="/assets/logo.png"
              alt="GFMSC Logo"
              className="h-16 w-16 mx-auto object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome Back
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
              Please login to continue to your account
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 text-red-800 border border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Email or Student ID
            </label>
            <input
              id="email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
              placeholder="example@gmail.com or your numeric Student ID"
              autoComplete="username"
              required
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Password
              </label>
              <Link
                to="/forgot-password"
                className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-4 py-3 pr-11 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-all"
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                tabIndex={-1}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-lg shadow-md block visible opacity-100 cursor-pointer z-50 transition-all duration-200"
          >
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Don't have login details? Contact your school administrator.
          </p>
          <div className="mt-4">
            <Link
              to="/"
              className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm"
            >
              ← Back to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}