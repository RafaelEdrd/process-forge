# Process Forge

**Motor de referência para pipelines declarativos, execução determinística e inspeção de dados.**

O projeto explora uma pergunta recorrente em automações: como descrever transformações de forma revisável, verificar dependências e evitar que uma etapa produza efeitos não previstos?

Este é o **repositório público demonstrativo**. A execução de referência é limitada, local e deliberadamente sem conectores externos. O motor operacional privado, que inclui persistência de execuções e edição administrativa, não está incluído.

## Funcionalidades incluídas

- Vitrine interativa de pipelines sintéticos em `showcase/`, com visualização de etapas e resultados.
- Núcleo independente em `reference/pipeline.mjs` usando apenas Node.js.
- Validação de identificadores, tipos de operadores e cardinalidade das dependências.
- Ordenação topológica, rejeição de ciclos, referências inválidas e etapas duplicadas.
- Operações permitidas: `source`, `select`, `filter`, `join`, `count` e `output`.
- `join` com duas entradas e verificação de unicidade das chaves da tabela à direita.
- Limites de 50 etapas e 1.000 registros por conjunto, sem execução arbitrária de JavaScript.
- Trilha simples com contagem de registros por etapa e testes para erros relevantes.

A interface visual possui sua própria implementação de execução. O diretório `reference/` é uma referência auditável menor, não uma cópia integral do motor de produção.

## Iniciar em Windows

Requisitos: Node.js 22+ para a referência; Python 3.11+ opcional para servir os arquivos estáticos.

```powershell
node reference/sample.mjs
node --test tests/reference.test.mjs
py scripts/verify_showcase.py
py -m http.server 8080 --bind 127.0.0.1 -d showcase
```

Abrir `http://127.0.0.1:8080/`. Não é necessário `npm install`: a parte publicada não depende de bibliotecas externas.

## Contrato do pipeline

Cada etapa é um objeto com `id`, `kind`, `inputs` e `config`. Entradas referenciam outras etapas por identificador. Operadores só recebem a quantidade prevista de entradas.

```js
{
  id: 'joined',
  kind: 'join',
  inputs: ['active', 'payments'],
  config: { leftKey: 'id', rightKey: 'client', mode: 'inner' }
}
```

`executePipeline()` devolve `{ rows, audit }`. A saída não grava arquivos, não chama URLs e não executa funções fornecidas pelo usuário.

## Pipeline de exemplo

```mermaid
flowchart LR
    A[Clientes fictícios] --> C[Filtrar ativos]
    B[Pagamentos fictícios] --> D[Join por chave]
    C --> D
    D --> E[Saída e auditoria]
```

A documentação e os testes cobrem três propriedades fundamentais: a execução depende somente das entradas, um DAG inválido é rejeitado antes de executar e um join com chaves ambíguas é recusado em vez de duplicar registros silenciosamente.

## Trade-offs

| Escolha | Consequência |
| --- | --- |
| Operadores em allowlist | Reduz superfície de ataque e facilita testes; limita expressividade |
| Sem conectores de rede | Demonstrações seguras, mas não substitui uma integração real |
| Limite de registros | Evita expansão descontrolada; não atende grandes volumes |
| Join com chave direita única | Resultado previsível; não oferece join muitos-para-muitos |
| Execução síncrona em memória | Simplicidade; sem recuperação após interrupção |

## Organização

```text
process-forge/
├── showcase/             Vitrine estática com fluxos de exemplo
├── reference/            Engine reduzido + execução de exemplo
├── tests/                Testes Node integrados ao CI
├── scripts/              Validação de arquivos publicados
├── docs/                 Decisões e fronteiras da demonstração
└── .github/workflows/ci.yml
```

## O que está fora do repositório

Não há conectores de clientes, filas distribuídas, agendamento, credenciais, controle multiusuário, execução persistente ou API administrativa. O laboratório privado inclui capacidades adicionais que não são disponibilizadas nesta referência.

A licença não foi aberta automaticamente: consulte [NOTICE.md](NOTICE.md) e [SECURITY.md](SECURITY.md). Portfólio e contato: https://rafaelanalyst.com.br/.
