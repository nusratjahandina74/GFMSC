import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import API from '../../services/api';

export default function VerifyEmail() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [status, setStatus] = useState('verifying'); // verifying | success | error
  const [message, setMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [resendMsg, setResendMsg] = useState('');

  useEffect(() => {
    const verify = async () => {
      if (!token || !email) {
        setStatus('error');
        setMessage('This verification link is missing required information.');
        return;
      }
      try {
        const res = await API.get('/auth/verify-email', { params: { token, email } });
        setStatus('success');
        setMessage(res.data?.message || 'Email verified successfully.');
      } catch (err) {
        setStatus('error');
        setMessage(err.response?.data?.message || 'Verification failed. The link may have expired.');
      }
    };
    verify();
  }, [token, email]);

  const handleResend = async () => {
    setResending(true);
    setResendMsg('');
    try {
      const res = await API.post('/auth/resend-verification', { email });
      setResendMsg(res.data?.message || 'Verification email resent.');
    } catch (err) {
      setResendMsg(err.response?.data?.message || 'Could not resend verification email.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-2xl p-8 text-center">
        {status === 'verifying' && (
          <>
            <Loader2 className="h-14 w-14 text-emerald-600 mx-auto mb-4 animate-spin" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Verifying your email...</h1>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle2 className="h-14 w-14 text-emerald-600 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Email Verified!</h1>
            <p className="text-gray-500 dark:text-gray-400 mb-6">{message}</p>
            <Link
              to="/login"
              className="inline-block w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-all duration-200"
            >
              Go to Login
            </Link>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="h-14 w-14 text-red-500 mx-auto mb-4" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Verification Failed</h1>
            <p className="text-gray-500 dark:text-gray-400 mb-6">{message}</p>

            {email && (
              <button
                onClick={handleResend}
                disabled={resending}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition-all duration-200 disabled:opacity-60 mb-3"
              >
                {resending ? 'Resending...' : 'Resend Verification Email'}
              </button>
            )}
            {resendMsg && <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{resendMsg}</p>}

            <Link to="/login" className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-sm">
              ← Back to Login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
