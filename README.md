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

As faixas-fonte da primeira HQ ficam em `HQ Torneio Infernal - Aurora vs Drekalia 1/` e são ignoradas pelo Git. A pasta contém `Drekai 1.mp3`, `Drekai 2.mp3`, `Isaac.mp3`, `Men'khir.mp3`, `Torneio.mp3` e `Kurogane.mp3`. Nenhum PDF ou áudio entra no catálogo público até você exportar e importar um pacote.

## Prévia local da primeira HQ

Para experimentar a HQ e as músicas originais, `npm.cmd run dev` lê `.local/comic-preview.json` e serve os arquivos diretamente da pasta-fonte com requisições por intervalo. Essa configuração e essas rotas existem somente durante o desenvolvimento: o `.local/` é ignorado pelo Git e o build de produção continua usando `public/content/catalog.json`, que não inclui esta prévia.

As marcações locais usam fades de 2 segundos: Torneio entra na página 2 e sai na 13; reentra na 14 e sai na 27. Isaac entra na 7 e sai na 14; quando marcações se sobrepõem, a entrada mais recente vence, então só Isaac toca nas páginas 7–13 e Torneio retorna na 14. Drekai 1 toca de 28 a 36; Kurogane retoma de 37 a 41; Drekai 2 toca de 42 a 53; Men'khir toca de 54 a 70. O leitor mantém no máximo uma faixa ativa, pausa a anterior antes de iniciar a próxima e preserva a posição ao virar páginas dentro do mesmo trecho. Saltos diretos calculam a faixa do destino, sem tocar cues intermediários. O zoom começa ajustado para caber a página inteira e fica salvo por HQ neste navegador.

O PDF original tem 225.014.742 bytes (aprox. 214,5 MiB), acima do limite de 95 MiB do publicador e do limite prático de um arquivo GitHub comum. Por isso esta HQ está pronta para teste local, mas ainda não para o pacote/repositório público gratuito. Antes de publicar, será preciso reduzir o PDF para menos de 95 MiB ou escolher hospedagem externa para esse arquivo; não coloquei uma cópia reduzida para não alterar sua arte sem autorização.

Ao abrir uma HQ pelo acervo, esse clique habilita a reprodução automática pelos cues de página, conforme as regras de autoplay do navegador. Em links abertos diretamente, pode ser necessário tocar uma vez no controle play. O controle compacto de play/pause continua disponível durante a leitura.

## Publicação gratuita

O repositório público `kuglerlucas/hq_datsu` publica a pasta `dist` no GitHub Pages. O PDF e as seis trilhas totalizam aproximadamente 281,9 MiB, por isso ficam como assets da GitHub Release `hq-torneio-v1`, não no histórico Git nem em Git LFS. Ao publicar essa Release, o workflow baixa os oito arquivos, monta `public/content/comics/` e publica o site. Os assets e a HQ ficam públicos.

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

3. No repositório, abra **Settings → Pages** e escolha **GitHub Actions** como origem de publicação.
4. A criação da Release dispara o primeiro deploy. Depois, cada push para `main` publica uma nova versão automaticamente.

Para uma HQ dentro do limite de publicação simples, continue usando o publicador e `npm.cmd run comic:import`. O workflow da primeira HQ usa a Release porque o PDF original supera o limite de arquivo do GitHub e o total ultrapassa o tamanho máximo do pacote local.

Antes de publicar, verifique os limites vigentes do [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits): o site publicado pode ter até 1 GB, e o limite recomendado de banda é soft em 100 GB por mês. O publicador limita cada arquivo a 95 MiB e o pacote-fonte de uma HQ a 250 MiB para evitar uploads Git comuns acima do limite. O conjunto de todas as edições também precisa caber na cota do site.

Use apenas músicas e imagens que você tem direito de distribuir. A imagem da nebulosa Carina em `public/images/` é uma referência visual temporária, creditada no próprio acervo e documentada junto ao arquivo; substitua-a pela arte de Datsu quando estiver pronta.

## Estrutura do conteúdo

- `public/content/catalog.json`: lista pública de HQs.
- `public/content/comics/<id>/`: PDFs, capas e MP3s publicados.
- `src/features/audio/pageCues.ts`: resolução e validação das marcações por página.
- `src/features/publisher/`: prévia local, exportação ZIP e validações do pacote.
- `tools/import-comic.mjs`: importador local do pacote baixado.

O catálogo é lido em tempo de execução. A biblioteca vazia inicial é intencional; não há HQ de demonstração nem conteúdo inventado.
