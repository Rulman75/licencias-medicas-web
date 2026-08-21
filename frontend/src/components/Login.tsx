import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await axios.post('/api/auth/login', {
        username,
        password
      });
      if (response.data.status === 'ok') {
        localStorage.setItem('token', response.data.token);
        localStorage.setItem('user', JSON.stringify(response.data.user));
        navigate('/inicio');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Error al iniciar sesión');
    }
  };

  return (
    <div className="flex h-screen w-full bg-gray-50">
      
      {/* Panel Izquierdo Corporativo (Logo y Branding) */}
      <div className="hidden md:flex flex-col justify-center items-center w-1/2 bg-[#016098] text-white p-12 shadow-[10px_0_15px_-3px_rgba(0,0,0,0.1)] z-10">
        <div className="bg-white p-6 rounded-2xl shadow-xl mb-8">
          <img src="/logo.png" alt="CMDS Logo" className="w-48 h-48 object-contain" />
        </div>
        <h1 className="text-4xl font-extrabold tracking-wider text-yellow-400 mb-4 text-center">
          CMDS
        </h1>
        <h2 className="text-xl font-semibold text-blue-200 tracking-wide text-center">
          Sistema de Gestión y Control de
        </h2>
        <h2 className="text-2xl font-bold text-white uppercase mt-2 tracking-widest text-center">
          Licencias Médicas
        </h2>
        <div className="mt-12 w-16 h-1 bg-yellow-400 rounded"></div>
      </div>

      {/* Panel Derecho (Formulario de Login) */}
      <div className="flex flex-col justify-center items-center w-full md:w-1/2 bg-white px-6">
        <div className="w-full max-w-md">
          
          {/* Logo visible solo en mobile */}
          <div className="md:hidden flex justify-center mb-8">
            <img src="/logo.png" alt="CMDS Logo" className="w-32 h-32 object-contain" />
          </div>

          <h3 className="text-3xl font-bold text-[#016098] mb-2">Bienvenido</h3>
          <p className="text-gray-500 mb-8">Ingresa tus credenciales para continuar</p>

          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 rounded mb-6 shadow-sm flex items-center gap-3 font-semibold">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd"></path>
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-[#016098] text-sm font-bold mb-2 uppercase tracking-wide" htmlFor="username">
                Usuario
              </label>
              <input
                id="username"
                type="text"
                placeholder="Ej: admin"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#016098] focus:bg-white transition shadow-sm text-gray-800 font-medium"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            </div>
            
            <div>
              <label className="block text-[#016098] text-sm font-bold mb-2 uppercase tracking-wide" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                className="w-full px-4 py-3 bg-gray-50 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#016098] focus:bg-white transition shadow-sm text-gray-800 font-medium"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              className="w-full bg-[#016098] hover:bg-[#024a8d] text-white font-bold py-3 px-4 rounded-lg transition duration-200 shadow-lg mt-4 flex justify-center items-center gap-2"
            >
              Ingresar al Sistema
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3"></path>
              </svg>
            </button>
          </form>
          
          <div className="mt-8 pt-6 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-400 font-semibold">
              &copy; 2026 CMDS - Corporación Municipal de Desarrollo Social de Antofagasta
            </p>
          </div>
        </div>
      </div>

    </div>
  );
}
