/**
 * Espaço reservado das telas ainda não implementadas. Existe para que a estrutura
 * de rotas (e os links do QR) já funcione desde o primeiro deploy, em vez de
 * quebrar em tela branca enquanto os módulos são escritos.
 */
export function EmBreve({ titulo }: { titulo: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <h1 className="text-2xl font-bold text-slate-900">{titulo}</h1>
      <p className="max-w-sm text-slate-500">
        Esta tela ainda está sendo construída.
      </p>
    </div>
  )
}
