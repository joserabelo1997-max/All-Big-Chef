import { useLiveQuery } from 'dexie-react-hooks'

import { PREFERENCIAS_PADRAO, type PreferenciasAlerta } from './configuracoes'
import { db } from './db'

/**
 * Preferências do restaurante, reagindo a mudanças.
 *
 * Diferente de `lerPreferencias`, que lê uma vez: aqui a tela se atualiza
 * sozinha quando alguém muda os dias de fechamento em Ajustes, sem precisar
 * recarregar. Como o Dexie é a fonte de leitura de tudo no app, o mesmo vale
 * quando a preferência chega pelo sync do outro aparelho da cozinha.
 */
export function usePreferencias(orgId: string | null): PreferenciasAlerta {
  return (
    useLiveQuery(
      async () => {
        if (!orgId) return PREFERENCIAS_PADRAO
        const salvas = await db.org_settings.get(orgId)
        if (!salvas) return PREFERENCIAS_PADRAO
        return {
          diasAntes: salvas.alerta_dias_antes,
          horario: salvas.alerta_horario.slice(0, 5),
          // Registro gravado antes desta versão não tem o campo.
          diasFechados: salvas.dias_fechados ?? [],
        }
      },
      [orgId],
    ) ?? PREFERENCIAS_PADRAO
  )
}
