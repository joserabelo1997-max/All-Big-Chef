import type { Fornecedor, MembroEquipe } from './types'

/**
 * O que ainda falta configurar para o estoque funcionar por inteiro.
 *
 * Existe porque três ajustes do módulo de estoque não têm como ser adivinhados
 * pelo sistema — o telefone do fornecedor, quem tem alçada para liberar e os
 * dias em que a casa fecha — e, sem eles, funções inteiras ficam mudas em vez
 * de dar erro. O pedido pelo WhatsApp abre sem número; as requisições empilham
 * sem ninguém que possa liberar; o aviso de casa fechada nunca dispara.
 *
 * Falha silenciosa é a pior espécie: ninguém procura o que não reclamou. Então
 * a tela de Estoque pergunta em vez de esperar.
 *
 * A lógica fica separada da interface para poder ser testada — e porque a regra
 * de "o que conta como configurado" é justamente a parte que erraria em
 * silêncio se ficasse embutida no JSX.
 */

export type ChavePendencia = 'telefone' | 'aprovador' | 'dias_fechados'

export interface Pendencia {
  chave: ChavePendencia
  titulo: string
  /** O que deixa de funcionar enquanto isso não for resolvido. */
  consequencia: string
  destino: string
  rotuloDestino: string
}

export interface EstadoDaConfiguracao {
  fornecedores: Fornecedor[]
  equipe: MembroEquipe[]
  diasFechados: number[]
}

/**
 * Lista o que falta, na ordem em que atrapalha.
 *
 * Devolve vazio quando está tudo certo — é o que faz o cartão sumir sozinho da
 * tela, sem ninguém precisar dispensá-lo.
 */
export function pendenciasDeConfiguracao(estado: EstadoDaConfiguracao): Pendencia[] {
  const pendencias: Pendencia[] = []

  // Fornecedor arquivado não conta: ele não aparece para receber pedido.
  const ativos = estado.fornecedores.filter((f) => !f.deleted_at && f.ativo)
  if (!ativos.some((f) => temTelefone(f.telefone))) {
    pendencias.push({
      chave: 'telefone',
      titulo: 'Nenhum fornecedor tem WhatsApp',
      consequencia: 'O pedido de reposição abre sem número, para escolher o contato à mão.',
      destino: '/config/fornecedores',
      rotuloDestino: 'Cadastrar telefone',
    })
  }

  // Membro desativado não conta: ele não aparece na lista para liberar nada.
  const naEquipe = estado.equipe.filter((m) => !m.deleted_at && m.ativo)
  if (!naEquipe.some((m) => m.pode_aprovar)) {
    pendencias.push({
      chave: 'aprovador',
      titulo: 'Ninguém pode liberar retirada do estoque',
      consequencia: 'As requisições ficam pendentes sem ninguém com permissão para aprovar.',
      destino: '/config/equipe',
      rotuloDestino: 'Definir quem libera',
    })
  }

  if (estado.diasFechados.length === 0) {
    pendencias.push({
      chave: 'dias_fechados',
      titulo: 'Dias de fechamento não informados',
      consequencia: 'O aviso do que vence com a casa fechada não aparece no painel.',
      destino: '/config/alertas',
      rotuloDestino: 'Marcar os dias',
    })
  }

  return pendencias
}

/**
 * Telefone que dá para discar.
 *
 * Espaço em branco não vale, e menos de 10 dígitos não é telefone brasileiro
 * com DDD — é a mesma régua de `telefoneParaWhatsapp` em `lib/whatsapp.ts`.
 * Aceitar um número quebrado aqui seria pior que avisar: o cartão sumiria e o
 * link do pedido continuaria não funcionando.
 */
function temTelefone(telefone: string | null | undefined): boolean {
  return (telefone ?? '').replace(/\D/g, '').length >= 10
}

/**
 * Se a pendência de dias fechados é apenas informativa.
 *
 * Uma casa que abre todos os dias não tem o que marcar, e transformar isso em
 * cobrança seria alarme falso — que é o que ensina a cozinha a ignorar alarme.
 */
export function ehApenasAviso(chave: ChavePendencia): boolean {
  return chave === 'dias_fechados'
}
