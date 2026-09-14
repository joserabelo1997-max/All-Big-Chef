import type { ComponentType } from 'react'
import {
  IconeCalculadora,
  IconeCalendario,
  IconeCompras,
  IconeConfig,
  IconeInicio,
  IconeInsumo,
  IconeLivro,
  IconeProducao,
  IconeReceita,
} from './Icones'

export interface Destino {
  para: string
  rotulo: string
  icone: ComponentType<{ className?: string }>
  descricao: string
  /** Aparece na barra inferior fixa, além da gaveta. */
  naBarra: boolean
}

/**
 * Uma lista só alimenta a gaveta lateral e a barra inferior. A barra leva os cinco
 * destinos que a mão alcança durante o serviço; o resto mora na gaveta.
 */
export const DESTINOS: Destino[] = [
  {
    para: '/',
    rotulo: 'Início',
    icone: IconeInicio,
    descricao: 'O dia de hoje num relance',
    naBarra: true,
  },
  {
    para: '/receitas',
    rotulo: 'Receitas',
    icone: IconeReceita,
    descricao: 'Fichas técnicas de pratos e preparos',
    naBarra: true,
  },
  {
    para: '/producao',
    rotulo: 'Produção',
    icone: IconeProducao,
    descricao: 'Checklist de mise en place do serviço',
    naBarra: true,
  },
  {
    para: '/cmv',
    rotulo: 'CMV',
    icone: IconeCalculadora,
    descricao: 'Custo, preço e as contas explicadas',
    naBarra: true,
  },
  {
    para: '/compras',
    rotulo: 'Compras',
    icone: IconeCompras,
    descricao: 'Lista gerada a partir do menu',
    naBarra: true,
  },
  {
    para: '/insumos',
    rotulo: 'Insumos',
    icone: IconeInsumo,
    descricao: 'Preço, fator de correção e fornecedor',
    naBarra: false,
  },
  {
    para: '/menus',
    rotulo: 'Menus',
    icone: IconeLivro,
    descricao: 'Conjuntos de pratos que você serve',
    naBarra: false,
  },
  {
    para: '/servicos',
    rotulo: 'Serviços',
    icone: IconeCalendario,
    descricao: 'Histórico do que foi servido, dia a dia',
    naBarra: false,
  },
  {
    para: '/config',
    rotulo: 'Configurações',
    icone: IconeConfig,
    descricao: 'Restaurantes, conta e backup',
    naBarra: false,
  },
]

export const DESTINOS_BARRA = DESTINOS.filter((d) => d.naBarra)
