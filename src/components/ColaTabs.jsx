// Barra de pestañas reutilizable para separar una cola de trabajo en
// "Pendientes" e "Historial" (atendidos), con contador en cada pestaña.
// Mismo patrón visual que Monitoreo en Ruta.
//
// Props:
//   tab       clave de la pestaña activa
//   setTab    callback(clave)
//   tabs      [{ key, label, count }]
export default function ColaTabs({ tab, setTab, tabs }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden mb-4">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => setTab(t.key)}
          className={`text-sm px-4 py-1.5 font-medium ${
            tab === t.key ? "bg-gray-100 text-gray-900 font-semibold" : "bg-white text-gray-500 hover:bg-gray-50"
          }`}
        >
          {t.label} <span className={tab === t.key ? "text-gray-500" : "text-gray-400"}>({t.count})</span>
        </button>
      ))}
    </div>
  );
}
