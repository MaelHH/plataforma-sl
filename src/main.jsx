import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Red de seguridad de TODA la app: si algo fuera del módulo activo truena (menú,
// Usuarios, Dialog, provider…), muestra un aviso con opción de recargar en vez de
// dejar la pantalla en blanco.
class RootErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Error en la app:", error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
          <div className="max-w-md w-full bg-white border border-red-200 rounded-2xl p-6 shadow-sm">
            <div className="text-sm font-semibold text-red-700 mb-1">La aplicación tuvo un error</div>
            <div className="text-xs text-gray-500 mb-4 font-mono break-words">{String(this.state.error?.message || this.state.error)}</div>
            <button onClick={() => window.location.reload()} className="text-xs px-4 py-2 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700">Recargar</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
