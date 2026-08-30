# Configurando a etiquetadora

Guia para parear a impressora Bluetooth e fazer a primeira etiqueta sair certa.

## Antes de começar: em que aparelho imprimir

O app usa **Web Bluetooth**, que só conversa com impressoras **BLE** (Bluetooth
Low Energy). Bluetooth Clássico, também chamado SPP — usado por Zebra, Brother
QL e boa parte das Elgin — não é alcançável por nenhum navegador. Não existe
contorno; é limitação da plataforma, não do app.

| Aparelho | Navegador | Imprime? |
| --- | --- | --- |
| Android | Chrome ou Edge | ✅ |
| Windows, Mac, Chromebook | Chrome ou Edge | ✅ |
| iPhone / iPad | **Bluefy** (grátis na App Store) | ✅ |
| iPhone / iPad | Safari | ❌ |

No iPhone o Safari não implementa Bluetooth e a Apple não sinalizou intenção de
implementar. A saída é o **Bluefy**, um navegador gratuito que embarca a própria
pilha Bluetooth: você abre o mesmo endereço do app dentro dele e imprime
normalmente. Nada muda no app.

Arranjo recomendado no iPhone: **Safari** para instalar o app na tela de início e
receber os alertas de validade; **Bluefy** para imprimir.

O endereço precisa ser HTTPS. Abrir o arquivo direto do disco não funciona.

## Teste que confirma se sua impressora serve

Se você tem uma **AIYIN**, faça este teste antes de qualquer coisa — leva dois
minutos:

1. Instale o app oficial da AIYIN (**"Label expert"**) no **iPhone**.
2. Pareie e imprima qualquer etiqueta por ele.

Se imprimiu, sua impressora é BLE e vai funcionar aqui. O raciocínio: o iOS
bloqueia Bluetooth Clássico para apps que não tenham o chip de certificação MFi
da Apple, que fabricante chinês não paga. Uma impressora com app de iPhone
funcional é, necessariamente, uma impressora BLE.

Se você só tem Android, esse teste não conclui nada — o Android aceita os dois
tipos. Nesse caso vá direto para o diagnóstico abaixo; ele descobre na prática.

## Diagnóstico: descobrindo os parâmetros

Fabricantes como a AIYIN não publicam os UUIDs Bluetooth nem a linguagem de
comando dos seus modelos, e esses valores mudam de lote para lote. Em vez de
chutar, o app pergunta à própria impressora e deixa você testar. Vá em
**Ajustes → Impressora**.

### 1. Parear

Ligue a impressora, deixe-a próxima, e toque em **Procurar etiquetadora**. O
navegador abre a lista de aparelhos Bluetooth por perto — escolha a sua. O nome
costuma ser algo como `AIYIN-XXXX`, `LabelPrinter` ou um código.

### 2. Escolher o canal de escrita

O app lista os canais de comunicação que a impressora expôs, **já ordenados do
mais provável para o menos**. Comece pelo primeiro. Se o teste não sair, volte e
tente o seguinte da lista.

Se aparecer *"a impressora conectou, mas não expôs nenhuma característica de
escrita"*, quase certamente ela é Bluetooth Clássico e não vai funcionar pelo
navegador. Me avise se acontecer.

### 3. Escolher linguagem e resolução

Teste as linguagens **nesta ordem**:

1. **TSPL / TSC** — o mais comum em etiquetadoras de rolo, que entendem o
   conceito de etiqueta de 60 × 40 com espaço entre elas.
2. **ESC/POS** — quase universal nas portáteis.
3. **CPCL** — último, porque manda a imagem em formato que dobra o tráfego.

Deixe a resolução em **203 dpi**, que é o que quase toda portátil usa. Só mude
para 300 se a etiqueta sair com o tamanho errado.

### 4. Imprimir o teste

Toque em **Imprimir etiqueta de teste** e compare o que saiu:

| O que saiu | O que fazer |
| --- | --- |
| Etiqueta legível, no tamanho certo | Pronto — toque em **Salvar perfil** |
| **Toda preta** | Linguagem errada. Troque e teste de novo |
| **Em branco** | Linguagem errada, ou canal de escrita errado |
| **Embaralhada / riscada** | Linguagem errada |
| **Cortada no meio** | Reduza *Bytes por envio* em Ajuste fino: 100, depois 60 |
| **Tamanho errado** | Troque o DPI entre 203 e 300 |
| **Muito clara** | Aumente a densidade de queima |
| **Borrada / manchada** | Diminua a densidade de queima |

**Meça a etiqueta impressa com régua.** Ela deve dar 60 mm de largura por 40 mm
de altura. Conferir na régua é o único jeito de garantir que o DPI está certo —
uma etiqueta em escala errada parece correta até você colar no pote e ver que
não cabe.

### 5. Salvar

Toque em **Salvar perfil**. O app passa a usar esses parâmetros sempre, e você
não precisa repetir a descoberta.

## Ajuste fino

| Parâmetro | Para que serve |
| --- | --- |
| **Espaçamento entre etiquetas** | Distância entre uma etiqueta e a próxima no rolo. Padrão 2 mm. Se as etiquetas saírem desalinhadas ou a impressora avançar demais, ajuste aqui |
| **Densidade de queima** (0–15) | Mais alto = mais escuro, porém mais lento e com mais desgaste da cabeça térmica. Padrão 8 |
| **Bytes por envio** | Quanto se manda por vez pelo Bluetooth. Padrão 182. Reduza se a impressão cortar no meio |

## Problemas comuns

**"Este navegador não tem suporte a Bluetooth"** — você está no Safari do iPhone
ou num navegador sem Web Bluetooth. Veja a tabela no começo deste documento.

**"O Bluetooth exige conexão segura (HTTPS)"** — abra pelo endereço oficial do
app, não por um arquivo local nem por um IP sem HTTPS.

**A impressora não aparece na lista** — confira se está ligada, carregada e não
pareada com outro aparelho ao mesmo tempo. Muitas portáteis aceitam só uma
conexão por vez: desconecte do celular antes de tentar pelo tablet.

**Imprime a primeira etiqueta e depois trava** — reduza os *Bytes por envio*.
Firmwares mais simples engasgam com blocos grandes.
