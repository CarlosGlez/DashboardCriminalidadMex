// Aviso ⚠ con la explicación en un globo (hover / foco). El contenedor debe ser position: relative.
export function WarnTip({ text }: { text: string }) {
  return (
    <span className="warn-tip" tabIndex={0} role="img" aria-label={`Advertencia: ${text}`}>
      <span aria-hidden="true">⚠</span>
      <span className="warn-tip-text" role="tooltip">{text}</span>
    </span>
  )
}
