import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { useStore } from '@/store/useStore';

const LoginPage = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const loginWithCredentials = useStore(s => s.loginWithCredentials);
  const businessName = useStore(s => s.businessName);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginWithCredentials(username.trim().toLowerCase(), password.trim());
      navigate('/pos');
    } catch (err: any) {
      setError(err.message || 'Usuario o contraseña incorrectos');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-[#FEF3DE]">
      {/* Decorative Brand Accent Circles */}
      <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full bg-[#C6BF81]/20 blur-3xl" />
      <div className="absolute -bottom-20 -right-20 w-80 h-80 rounded-full bg-[#364266]/10 blur-3xl" />

      <div className="w-full max-w-sm relative z-10">
        <div className="rounded-3xl p-8 bg-white/90 backdrop-blur-xl border border-[#364266]/15 shadow-2xl text-center">
          <div className="mb-6">
            <div className="w-48 h-24 mx-auto mb-2 flex items-center justify-center">
              <img src="/logo/logo-login.svg" alt={businessName} className="max-h-full max-w-full object-contain" />
            </div>
            <h1 className="font-sans font-bold text-2xl text-[#364266]">{businessName.toUpperCase()}</h1>
            <p className="text-xs mt-1 text-[#897863] font-sans">
              Sistema Punto de Venta POS
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4 text-left font-sans">
            <div>
              <label className="text-xs font-bold text-[#897863] mb-1.5 block uppercase tracking-wider">Usuario</label>
              <div className="relative">
                <User size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#897863]" />
                <input
                  value={username} onChange={e => setUsername(e.target.value)}
                  placeholder="Ingrese su usuario"
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm bg-[#FAF8EA] border border-[#364266]/20 text-[#364266] focus:border-[#364266] focus:outline-none focus:ring-1 focus:ring-[#364266]"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-[#897863] mb-1.5 block uppercase tracking-wider">Contraseña</label>
              <div className="relative">
                <Lock size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#897863]" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-3 rounded-xl text-sm bg-[#FAF8EA] border border-[#364266]/20 text-[#364266] focus:border-[#364266] focus:outline-none focus:ring-1 focus:ring-[#364266]"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#897863] hover:text-[#364266]">
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && <p className="text-xs text-center text-red-600 font-medium">{error}</p>}

            <button type="submit" disabled={loading}
              className="w-full py-3.5 rounded-xl font-sans font-bold text-base bg-[#364266] hover:bg-[#242D49] text-[#FEF3DE] shadow-lg transition-all disabled:opacity-60">
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="w-4 h-4 border-2 border-[#FEF3DE]/30 border-t-[#FEF3DE] rounded-full animate-spin" />
                  INGRESANDO...
                </span>
              ) : 'INGRESAR AL SISTEMA'}
            </button>
          </form>
        </div>

        <p className="text-center text-[11px] mt-4 text-[#897863]">
          🔒 {businessName} POS v2.0
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
