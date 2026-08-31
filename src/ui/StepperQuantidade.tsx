/**
 * Controle de quantidade de um produto no carrinho.
 *
 * Zerado, mostra só um `+` largo — o gesto mais comum é "somar mais um". Com
 * quantidade, vira `− N +`, e o `−` some junto com o item quando chega a zero.
 *
 * Os botões têm alvo de toque grande de propósito: quem usa isso está com a mão
 * ocupada, muitas vezes de luva, no meio do serviço.
 */
export function StepperQuantidade({
  quantidade,
  aoSomar,
  rotulo,
}: {
  quantidade: number
  aoSomar: (delta: number) => void
  /** Nome do produto, para os leitores de tela. */
  rotulo: string
}) {
  if (quantidade === 0) {
    return (
      <button
        type="button"
        onClick={() => aoSomar(1)}
        aria-label={`Adicionar ${rotulo}`}
        className="min-h-toque w-14 shrink-0 rounded-xl border-2 border-slate-900 bg-slate-900
          text-2xl font-bold leading-none text-white transition active:scale-95"
      >
        +
      </button>
    )
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={() => aoSomar(-1)}
        aria-label={`Menos um de ${rotulo}`}
        className="min-h-toque w-12 rounded-xl border-2 border-slate-300 bg-white
          text-2xl font-bold leading-none text-slate-700 transition active:scale-95"
      >
        −
      </button>
      <span
        className="min-w-[2.5rem] text-center text-2xl font-bold tabular-nums"
        aria-label={`${quantidade} de ${rotulo}`}
      >
        {quantidade}
      </span>
      <button
        type="button"
        onClick={() => aoSomar(1)}
        aria-label={`Mais um de ${rotulo}`}
        className="min-h-toque w-12 rounded-xl border-2 border-slate-900 bg-slate-900
          text-2xl font-bold leading-none text-white transition active:scale-95"
      >
        +
      </button>
    </div>
  )
}
