# Configurando a etiquetadora

Guia para conectar a impressora e fazer a primeira etiqueta sair certa.

## A impressora deste projeto

Uma **AIYIN de bancada**, com estas características confirmadas na ficha:

| | |
| --- | --- |
| Resolução | **203 DPI** — é o padrão já configurado no app |
| Largura de papel | 40 a 110 mm (a etiqueta de 60 mm cabe folgado) |
| Velocidade | 160 mm/s |
| Conexão | **Bluetooth e USB** |
| Alimentação | 127 V / 220 V — é de bancada, não portátil a bateria |

### ⚠️ Os rolos que vêm de brinde não servem

A impressora acompanha rolos de **5 × 2,5 cm** e **10 × 15 cm**. Nenhum dos dois
é o tamanho que o app usa. Compre um rolo de **etiqueta 60 × 40 mm**, que é
medida comum e barata no Brasil — procure por "etiqueta térmica 60x40" em
qualquer papelaria ou marketplace.

Se preferir aproveitar os rolos que vieram, dá para mudar o tamanho da etiqueta
no diagnóstico e reposicionar os campos no editor (**Ajustes → Modelo da
etiqueta**). Mas 60 × 40 é o tamanho para o qual o modelo padrão foi desenhado.

## Cabo ou Bluetooth?

Como esta impressora fica plugada na tomada e parada na bancada, **o cabo USB é
geralmente a melhor escolha**: manda a etiqueta em uma fração do tempo, não
perde pareamento e não briga com o celular que conectou antes. O app suporta as
duas vias — você escolhe no diagnóstico.

| | Cabo USB | Bluetooth |
| --- | --- | --- |
| Android (Chrome) | ✅ com cabo OTG | ✅ |
| Linux, ChromeOS | ✅ | ✅ |
| Windows, Mac | ⚠️ o sistema costuma travar o acesso | ✅ |
| iPhone | ❌ não existe | ✅ pelo Bluefy |

No Windows e no Mac o navegador quase sempre falha ao assumir a impressora,
porque o driver do próprio sistema já a reivindicou. Não é falha do app — é como
o sistema operacional protege o aparelho. Nesses casos, use Bluetooth.

## Sobre o Bluetooth: uma limitação que vale entender

O navegador só conversa com Bluetooth **BLE** (Low Energy). Bluetooth Clássico,
também chamado SPP, não é alcançável por navegador algum — é limitação da
plataforma, não do app, e não existe contorno em JavaScript.

Não dá para saber pela ficha do produto qual dos dois a impressora usa. Mas
**isso deixou de ser um risco**, porque se o Bluetooth não funcionar, o cabo USB
resolve — e o inverso também vale.

O endereço precisa ser HTTPS. Abrir o arquivo direto do disco não funciona.

## Imprimir do iPhone: as opções, da melhor para a pior

O Safari não implementa Bluetooth nativamente e a Apple não sinalizou intenção
de implementar. Mas isso **não** significa que o iPhone esteja fora — há quatro
caminhos, e o primeiro resolve sem trocar de navegador.

### 1. beacio — extensão do Safari (recomendado, grátis)

O [**beacio**](https://beacio.com/) é uma extensão do Safari com aplicativo
companheiro que instala `navigator.bluetooth` no próprio Safari, ligando à
CoreBluetooth do iOS. Declara 92 de 93 pontos de conformidade com a
especificação W3C, e **não exige nenhuma alteração no nosso código** — o app
simplesmente passa a enxergar Bluetooth.

É a melhor opção porque elimina o malabarismo de dois navegadores: o mesmo
Safari instala o app, recebe os alertas de validade e imprime.

Como ativar: instale o app beacio da App Store e habilite em
**Ajustes → Apps → Safari → Extensões**, marcando "Permitir sempre" para o
endereço do All Big Chef.

### 2. Bluefy — navegador separado (grátis)

O [**Bluefy**](https://apps.apple.com/us/app/bluefy-web-ble-browser/id1492822055)
é um navegador que embarca a própria pilha Bluetooth. Funciona bem, mas obriga a
abrir o app dentro dele para imprimir, enquanto os alertas continuam vindo pelo
Safari. Boa alternativa se o beacio não funcionar no seu aparelho.

### 3. Cabo USB num Android ou computador da bancada

Se houver qualquer Android ou PC na cozinha, ele vira a estação de impressão por
cabo, e o iPhone segue usado para consultar, dar baixa e receber alertas. Não
custa nada se o aparelho já existe.

### 4. Aplicativo nativo próprio

Empacotar este mesmo app com Capacitor e um plugin BLE nativo. Funciona, mas
custa uma conta de desenvolvedor Apple (US$ 99/ano), exige um Mac com Xcode e
cria um segundo artefato para manter. Só vale se um dia você quiser o app
publicado na App Store com ícone próprio.

### O que NÃO funciona, para não perder tempo

- **AirPrint** — esta impressora não tem Wi-Fi nem suporte a AirPrint.
- **Atalhos (Shortcuts) do iOS** — não acessam GATT de Bluetooth.
- **WebUSB no iPhone** — não existe no iOS, em nenhum navegador.

### Teste rápido que antecipa a resposta

Se quiser saber antes de mexer no app: instale o aplicativo oficial da AIYIN
(**"Label expert"**) num **iPhone** e imprima por ele. Se funcionar, a impressora
é BLE necessariamente — o iOS bloqueia Bluetooth Clássico para quem não tem a
certificação MFi da Apple, que fabricante chinês não paga.

Num Android o teste não conclui nada, porque o Android aceita os dois tipos.

## Diagnóstico: descobrindo os parâmetros

Fabricantes como a AIYIN não publicam os UUIDs Bluetooth nem a linguagem de
comando dos seus modelos, e esses valores mudam de lote para lote. Em vez de
chutar, o app pergunta à própria impressora e deixa você testar. Vá em
**Ajustes → Impressora**.

### 1. Escolher a conexão e conectar

Escolha entre **Cabo USB** e **Bluetooth** (veja a tabela acima para decidir) e
toque no botão de procurar.

- **No USB**, o navegador lista os dispositivos conectados — escolha a
  impressora. Não há pareamento nem senha.
- **No Bluetooth**, ligue a impressora, deixe-a próxima e escolha na lista. O
  nome costuma ser algo como `AIYIN-XXXX`, `LabelPrinter` ou um código.

### 2. Escolher o canal de escrita (só no Bluetooth)

O app lista os canais de comunicação que a impressora expôs, **já ordenados do
mais provável para o menos**. Comece pelo primeiro. Se o teste não sair, volte e
tente o seguinte da lista.

Se aparecer *"a impressora conectou, mas não expôs nenhuma característica de
escrita"*, quase certamente ela é Bluetooth Clássico e não vai funcionar pelo
navegador. Nesse caso, **tente pelo cabo USB** — é exatamente o cenário em que
ele salva. Me avise se nenhum dos dois funcionar.

No USB esta etapa não existe: o canal é descoberto sozinho na conexão.

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

**"O sistema operacional já está usando esta impressora"** — acontece no Windows
e no Mac: o driver de impressora do sistema tomou o aparelho e não o libera para
o navegador. Use Bluetooth, ou conecte o cabo num Android com adaptador OTG.

**"Este navegador não tem suporte a Bluetooth"** — você está no Safari do iPhone
ou num navegador sem Web Bluetooth. Troque para o Bluefy, ou use o cabo USB.

**"O Bluetooth exige conexão segura (HTTPS)"** — abra pelo endereço oficial do
app, não por um arquivo local nem por um IP sem HTTPS.

**A impressora não aparece na lista** — confira se está ligada e, no Bluetooth,
se não está pareada com outro aparelho ao mesmo tempo. Muitas aceitam só uma
conexão por vez: desconecte do celular antes de tentar pelo tablet.

**Imprime a primeira etiqueta e depois trava** — reduza os *Bytes por envio*.
Firmwares mais simples engasgam com blocos grandes.

**Sai uma etiqueta em branco a cada impressão** — o espaçamento entre etiquetas
está errado para o rolo. Ajuste *Espaçamento entre etiquetas* no Ajuste fino.

**A etiqueta sai deslocada, invadindo a próxima** — geralmente é o rolo: confira
se ele é mesmo 60 × 40 mm. Rolos de outro tamanho desalinham o sensor de gap.
