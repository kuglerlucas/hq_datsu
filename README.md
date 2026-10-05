# DATSU | Arquivo de HQs

Site estático em português para organizar HQs do RPG Datsu, ler PDFs com controles de página e tocar trilhas MP3 com transições configuradas por página. Não há servidor de upload: os arquivos são preparados no navegador, exportados em um pacote e importados no projeto antes do deploy.

## Desenvolvimento

Requer Node.js 20.19 ou superior. No PowerShell:

```powershell
npm.cmd install
npm.cmd run dev
```

O modo de desenvolvimento local inclui **Preparar HQ**, disponível somente neste computador. O build de produção é apenas para leitores: não mostra ferramentas nem controles para adicionar arquivos. Cada nova edição continua sob seu controle e só aparece no site depois de você importar o pacote e publicar uma atualização.

Comandos adicionais:

```powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd run preview
```

## Adicionar uma HQ

1. Abra **Preparar HQ** no site local.
2. Selecione o PDF. O leitor identifica a quantidade de páginas.
3. Adicione arquivos MP3 e marque a página de entrada e a duração do fade. Uma marcação em **Silêncio** encerra a faixa anterior suavemente.
4. Use **Pré-visualizar** para testar a leitura local ou **Gerar pacote ZIP** e depois **Baixar pacote ZIP** para obter o pacote de publicação.
5. Importe o pacote na raiz deste projeto:

```powershell
npm.cmd run comic:import -- "C:\caminho\para\hq-publicacao.zip"
```

Para substituir uma edição com o mesmo ID:

```powershell
npm.cmd run comic:import -- "C:\caminho\para\hq-publicacao.zip" --replace
```

O importador valida o manifesto, páginas, faixas e caminhos antes de atualizar `public/content/catalog.json`. `--replace` substitui arquivos com o mesmo nome, mas não remove arquivos antigos que deixaram de ser referenciados; remova-os manualmente se desejar reduzir o tamanho publicado.

As fontes dos volumes 1 e 2 ficam em `HQ Torneio Infernal - Aurora vs Drekalia 1/` e `HQ Torneio Infernal - Aurora vs Drekalia 2/`; ambas são ignoradas pelo Git. Nenhum PDF ou áudio-fonte pesado entra no histórico do repositório.

## Prévia local da primeira HQ

Para experimentar a HQ e as músicas originais, `npm.cmd run dev` lê `.local/comic-preview.json` e serve os arquivos diretamente da pasta-fonte com requisições por intervalo. Essa configuração e essas rotas existem somente durante o desenvolvimento: o `.local/` é ignorado pelo Git e o build de produção continua usando `public/content/catalog.json`, que não inclui esta prévia.

O volume 1 usa fades de 2 segundos. No volume 2, os cues trocam sem fade: Sociedade entra na página 2 e sai na 9; Suspense 1 entra na 10 e sai na 12; Suspense 2 entra na 13 e sai na 17; Exploração 1 entra na 18 e sai na 25; Combate 1 entra na 26 e sai na 29; Heroísmo entra na 30 e sai na 34; Exploração 1 retorna na 35 e sai na 48; Coração entra na 49 e sai na 60; Combate 2 entra na 61 e sai na 71. O leitor mantém no máximo uma faixa ativa, pausa a anterior antes de iniciar a próxima e preserva a posição ao virar páginas dentro do mesmo trecho. Saltos diretos calculam a faixa do destino, sem tocar cues intermediários. O zoom começa ajustado para caber a página inteira e fica salvo por HQ neste navegador.

Os PDFs originais dos volumes 1 e 2 têm aproximadamente 214,5 MiB e 219,8 MiB. Como cada um supera o limite de arquivo do Git comum, os binários são entregues pelas Releases `hq-torneio-v1` e `hq-torneio-v2`; os dois volumes e as trilhas ficam públicos no GitHub Pages.

Ao abrir uma HQ pelo acervo, esse clique habilita a reprodução automática pelos cues de página, conforme as regras de autoplay do navegador. Em links abertos diretamente, pode ser necessário tocar uma vez no controle play. O controle compacto de play/pause continua disponível durante a leitura.

## Publicação gratuita

O repositório público `kuglerlucas/hq_datsu` publica a pasta `dist` no GitHub Pages. Os PDFs e trilhas dos dois volumes ficam como assets das Releases `hq-torneio-v1` e `hq-torneio-v2`, não no histórico Git nem em Git LFS. O workflow baixa ambas, monta `public/content/comics/` e publica o catálogo. Os assets e as HQs ficam públicos.

1. Envie o projeto para a branch `main`. O primeiro workflow aguardará a Release de mídia.
2. Com GitHub CLI autenticado (`gh auth login`), crie a Release a partir da pasta das fontes:

```powershell
Push-Location ".\HQ Torneio Infernal - Aurora vs Drekalia 1"
gh release create hq-torneio-v1 `
	--repo kuglerlucas/hq_datsu `
	--target main `
	--title "Torneio Infernal: Aurora vs Drekalia - Volume 1" `
	--notes "PDF, capa e trilhas usados pelo acervo Datsu." `
	"HQ - Torneio Infernal - Aurora vs Drekalia V. 1.pdf" `
	"Capa.png" `
	"Isaac.mp3" `
	"Torneio.mp3" `
	"Kurogane.mp3" `
	"Drekai 1.mp3" `
	"Drekai 2.mp3" `
	"Men'khir.mp3"
Pop-Location
```

Ao criar a Release do volume 2, o GitHub normaliza espaços e acentos nos nomes dos assets; o workflow usa esses nomes normalizados ao montar os caminhos públicos:

```powershell
Push-Location ".\HQ Torneio Infernal - Aurora vs Drekalia 2"
gh release create hq-torneio-v2 `
	--repo kuglerlucas/hq_datsu `
	--target main `
	--title "Torneio Infernal: Aurora vs Drekalia - Volume 2" `
	--notes "PDF e trilhas do volume 2 usados pelo acervo Datsu." `
	"HQ - Torneio Infernal - Aurora vs Drekalia V. 2.pdf" `
	"Sociedade.mp3" `
	"Suspense 1.mp3" `
	"Suspense 2.mp3" `
	"Exploração 1.mp3" `
	"Combate 1.mp3" `
	"Heroismo.mp3" `
	"Coração.mp3" `
	"Combate 2.mp3"
Pop-Location
```

3. No repositório, abra **Settings → Pages** e escolha **GitHub Actions** como origem de publicação.
4. A criação da Release dispara o primeiro deploy. Depois, cada push para `main` publica uma nova versão automaticamente.

Para uma HQ dentro do limite de publicação simples, continue usando o publicador e `npm.cmd run comic:import`. Os volumes 1 e 2 usam Releases porque cada PDF supera o limite de arquivo do GitHub e cada pacote-fonte ultrapassa o tamanho máximo do publicador.

Antes de publicar, verifique os limites vigentes do [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits): o site publicado pode ter até 1 GB, e o limite recomendado de banda é soft em 100 GB por mês. O publicador limita cada arquivo a 95 MiB e o pacote-fonte de uma HQ a 250 MiB para evitar uploads Git comuns acima do limite. O conjunto de todas as edições também precisa caber na cota do site.

Use apenas músicas e imagens que você tem direito de distribuir. A imagem da nebulosa Carina em `public/images/` é uma referência visual temporária, creditada no próprio acervo e documentada junto ao arquivo; substitua-a pela arte de Datsu quando estiver pronta.

## Estrutura do conteúdo

- `public/content/catalog.json`: lista pública de HQs.
- `public/content/comics/<id>/`: PDFs, capas e MP3s publicados.
- `src/features/audio/pageCues.ts`: resolução e validação das marcações por página.
- `src/features/publisher/`: prévia local, exportação ZIP e validações do pacote.
- `tools/import-comic.mjs`: importador local do pacote baixado.

O catálogo é lido em tempo de execução e atualmente publica os volumes 1 e 2 de Torneio Infernal: Aurora vs Drekalia.
