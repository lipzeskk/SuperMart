"use strict";

/* =====================================================================
   SuperMart Estoque — CRUD de produtos em JavaScript puro.
   Organização (POO):
     Produto             -> entidade com regras e validação
     RepositorioProdutos -> CRUD + gravação no localStorage do navegador
     Telas               -> monta o HTML de cada tela
     App                 -> rotas (#/...) e eventos
   ===================================================================== */

// ---------- Utilitários ----------

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dinheiro = (v) => moeda.format(v).replace(/ /g, " ");
const unidades = (n) => `${n} ${n === 1 ? "unidade" : "unidades"}`;
const hoje = () => new Date().toLocaleDateString("sv-SE"); // AAAA-MM-DD, horário local

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Aceita "12,50", "12.50" e "1.234,56". */
function lerPreco(texto) {
  let t = String(texto ?? "").trim().replace("R$", "").replace(/\s/g, "");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  if (t === "" || !Number.isFinite(n)) {
    throw new Error("Confira o preço: use um valor como 12,50.");
  }
  return n;
}

function lerInteiro(texto, campo) {
  const t = String(texto ?? "").trim();
  if (!/^-?\d+$/.test(t)) {
    throw new Error(`Confira o campo ${campo}: use apenas números inteiros.`);
  }
  return Number(t);
}

// ---------- Entidade ----------

class Produto {
  constructor({ id, nome, categoria, preco, quantidade, quantidadeMinima,
                precoAnterior = null, dataPrecoAlterado = null }) {
    this.id = id;
    this.precoAnterior = precoAnterior;
    this.dataPrecoAlterado = dataPrecoAlterado;
    this.definirDados({ nome, categoria, preco, quantidade, quantidadeMinima });
  }

  /** Valida e grava os dados básicos. */
  definirDados({ nome, categoria, preco, quantidade, quantidadeMinima }) {
    nome = String(nome ?? "").trim();
    if (!nome) throw new Error("Informe o nome do produto.");
    if (nome.length > 80) throw new Error("O nome pode ter no máximo 80 caracteres.");
    if (!(preco > 0)) throw new Error("O preço precisa ser maior que zero.");
    if (!Number.isInteger(quantidade) || quantidade < 0) {
      throw new Error("A quantidade não pode ser negativa.");
    }
    if (!Number.isInteger(quantidadeMinima) || quantidadeMinima < 0) {
      throw new Error("O estoque mínimo não pode ser negativo.");
    }
    this.nome = nome;
    this.categoria = String(categoria ?? "").trim() || "Outros";
    this.preco = Math.round(preco * 100) / 100;
    this.quantidade = quantidade;
    this.quantidadeMinima = quantidadeMinima;
  }

  /** Atualiza; se o preço mudou, guarda o anterior e a data (etiqueta amarela). */
  atualizar(dados) {
    const precoAtual = this.preco;
    this.definirDados(dados);
    if (precoAtual !== this.preco) {
      this.precoAnterior = precoAtual;
      this.dataPrecoAlterado = hoje();
    }
  }

  /** Entrada (positivo) ou saída (negativo) de mercadoria. */
  ajustarQuantidade(delta) {
    const nova = this.quantidade + delta;
    if (nova < 0) {
      throw new Error(`Só restam ${this.quantidade} unidades. A saída não pode passar disso.`);
    }
    this.quantidade = nova;
  }

  get situacao() {
    if (this.quantidade === 0) return "ruptura";
    if (this.quantidade <= this.quantidadeMinima) return "baixo";
    return "ok";
  }

  get precoAlteradoHoje() { return this.dataPrecoAlterado === hoje(); }
  get valorEmEstoque() { return this.preco * this.quantidade; }
}

// ---------- Repositório (CRUD + persistência) ----------

class RepositorioProdutos {
  static CHAVE = "supermart.estoque.v1";

  constructor() {
    this.produtos = [];
    this.proximoId = 1;
    this.carregar();
    if (this.produtos.length === 0 && !this.jaIniciado) this.semear();
  }

  // Criar
  criar(dados) {
    const p = new Produto({ id: this.proximoId, ...dados });
    this.produtos.push(p);
    this.proximoId++;
    this.salvar();
    return p;
  }

  // Ler
  buscar(id) { return this.produtos.find((p) => p.id === id) ?? null; }
  listar() {
    return [...this.produtos].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }

  // Atualizar
  atualizar(id, dados) {
    this.buscar(id).atualizar(dados);
    this.salvar();
  }
  ajustarQuantidade(id, delta) {
    this.buscar(id).ajustarQuantidade(delta);
    this.salvar();
  }

  // Excluir
  excluir(id) {
    const antes = this.produtos.length;
    this.produtos = this.produtos.filter((p) => p.id !== id);
    this.salvar();
    return this.produtos.length < antes;
  }

  // Persistência (se o navegador bloquear o armazenamento, funciona só em memória)
  salvar() {
    try {
      localStorage.setItem(RepositorioProdutos.CHAVE,
        JSON.stringify({ proximoId: this.proximoId, produtos: this.produtos }));
    } catch (e) { /* segue em memória */ }
  }

  carregar() {
    try {
      const bruto = localStorage.getItem(RepositorioProdutos.CHAVE);
      if (!bruto) return;
      const dados = JSON.parse(bruto);
      this.jaIniciado = true;
      this.proximoId = dados.proximoId;
      this.produtos = dados.produtos.map((d) => new Produto(d));
    } catch (e) {
      this.produtos = [];
    }
  }

  semear() {
    const exemplos = [
      ["Arroz Branco Tipo 1 5kg", "Mercearia", 27.90, 84, 20],
      ["Feijão Carioca 1kg", "Mercearia", 8.49, 120, 30],
      ["Leite Integral 1L", "Laticínios", 5.29, 18, 40],
      ["Café Torrado e Moído 500g", "Mercearia", 19.90, 4, 15],
      ["Óleo de Soja 900ml", "Mercearia", 7.99, 0, 25],
      ["Pão de Forma Tradicional", "Padaria", 8.90, 36, 12],
      ["Banana Prata (kg)", "Hortifruti", 6.49, 52, 15],
      ["Detergente Neutro 500ml", "Limpeza", 2.79, 0, 30],
      ["Refrigerante Cola 2L", "Bebidas", 9.49, 64, 24],
      ["Queijo Mussarela (kg)", "Frios", 42.90, 9, 10],
    ];
    for (const [nome, categoria, preco, quantidade, quantidadeMinima] of exemplos) {
      this.criar({ nome, categoria, preco, quantidade, quantidadeMinima });
    }
  }
}

// ---------- Telas (HTML) ----------

const Telas = {
  selo(p) {
    if (p.situacao === "ok") return `<span class="selo selo-ok">Em estoque</span>`;
    if (p.situacao === "baixo") {
      return `<span class="selo selo-baixo">Restam ${unidades(p.quantidade)}</span>`;
    }
    return `<span class="selo selo-ruptura">Em falta na gôndola</span>`;
  },

  etiquetaPreco(p) {
    return p.precoAlteradoHoje ? `<span class="etiqueta-preco">Preço alterado hoje</span>` : "";
  },

  aviso(mensagem) {
    if (!mensagem) return "";
    const erro = mensagem.startsWith("!");
    return `<div class="aviso ${erro ? "aviso-erro" : "aviso-ok"}" role="status">${esc(erro ? mensagem.slice(1) : mensagem)}</div>`;
  },

  lista(produtos, filtro, mensagem) {
    const ruptura = produtos.filter((p) => p.situacao === "ruptura").length;
    const baixo = produtos.filter((p) => p.situacao === "baixo").length;
    const valor = produtos.reduce((soma, p) => soma + p.valorEmEstoque, 0);
    const chips = [["todos", "Todos"], ["ruptura", "Em falta"], ["baixo", "Estoque baixo"], ["ok", "Em estoque"]]
      .map(([id, rotulo]) =>
        `<button type="button" class="chip${id === filtro ? " chip-ativo" : ""}" data-filtro="${id}">${rotulo}</button>`)
      .join("");

    return `
      ${this.aviso(mensagem)}
      <header class="topo">
        <h1>Estoque atual</h1>
        <a class="btn btn-primario btn-grande" href="#/novo">+ Novo produto</a>
      </header>

      <section class="resumo">
        <div class="card"><span class="card-num">${produtos.length}</span><span class="card-rot">produtos no cadastro</span></div>
        <div class="card card-ruptura"><span class="card-num">${ruptura}</span><span class="card-rot">em falta na gôndola</span></div>
        <div class="card card-baixo"><span class="card-num">${baixo}</span><span class="card-rot">com estoque baixo</span></div>
        <div class="card card-valor"><span class="card-num">${dinheiro(valor)}</span><span class="card-rot">valor em estoque</span></div>
      </section>

      <section class="barra">
        <div class="busca">
          <input type="search" id="busca" placeholder="Buscar produto ou categoria" aria-label="Buscar">
        </div>
        <div class="filtros">${chips}</div>
      </section>

      <div id="tabela"></div>`;
  },

  tabela(produtos) {
    if (produtos.length === 0) {
      return `<p class="vazio">Nenhum produto encontrado.</p>`;
    }
    const linhas = produtos.map((p) => `
      <tr class="linha-${p.situacao}">
        <td><a class="produto-nome" href="#/produto/${p.id}">${esc(p.nome)}</a><span class="produto-cat">${esc(p.categoria)}</span></td>
        <td class="num">${dinheiro(p.preco)}${this.etiquetaPreco(p)}</td>
        <td class="num"><span class="qtd-grande">${p.quantidade}</span></td>
        <td>${this.selo(p)}</td>
        <td class="acoes">
          <a class="btn btn-secundario" href="#/produto/${p.id}">Ver</a>
          <a class="btn btn-secundario" href="#/produto/${p.id}/editar">Editar</a>
        </td>
      </tr>`).join("");
    return `
      <div class="tabela-wrap"><table>
        <thead><tr><th>Produto</th><th class="num">Preço</th><th class="num">Estoque</th><th>Situação</th><th></th></tr></thead>
        <tbody>${linhas}</tbody>
      </table></div>`;
  },

  detalhe(p, mensagem) {
    const historico = p.precoAnterior != null
      ? `<p class="historico">Preço anterior: ${dinheiro(p.precoAnterior)} · alterado em ${p.dataPrecoAlterado.split("-").reverse().join("/")}</p>`
      : "";
    return `
      ${this.aviso(mensagem)}
      <p class="voltar"><a href="#/">← Voltar ao estoque</a></p>
      <header class="topo">
        <h1>${esc(p.nome)}</h1>
        <div class="topo-acoes">
          <a class="btn btn-azul btn-grande" href="#/produto/${p.id}/editar">Editar</a>
          <a class="btn btn-perigo btn-grande" href="#/produto/${p.id}/excluir">Excluir</a>
        </div>
      </header>

      <section class="detalhe">
        <div class="painel painel-estoque situacao-${p.situacao}">
          <span class="rotulo">Estoque atual</span>
          <span class="numerao">${p.quantidade}</span>
          <span class="painel-unid">${p.quantidade === 1 ? "unidade" : "unidades"}</span>
          ${this.selo(p)}
        </div>
        <div class="painel">
          <span class="rotulo">Preço de venda</span>
          <span class="numerao numerao-preco">${dinheiro(p.preco)}</span>
          ${this.etiquetaPreco(p)}
          ${historico}
        </div>
        <div class="painel">
          <span class="rotulo">Dados do cadastro</span>
          <dl>
            <dt>Código</dt><dd>#${String(p.id).padStart(4, "0")}</dd>
            <dt>Categoria</dt><dd>${esc(p.categoria)}</dd>
            <dt>Estoque mínimo</dt><dd>${unidades(p.quantidadeMinima)}</dd>
            <dt>Valor em estoque</dt><dd>${dinheiro(p.valorEmEstoque)}</dd>
          </dl>
        </div>
      </section>

      <section class="painel painel-ajuste">
        <h2>Recebeu ou vendeu mercadoria?</h2>
        <form class="form-ajuste" id="form-ajuste">
          <label for="qtd">Quantidade</label>
          <input id="qtd" name="quantidade" type="number" min="1" value="1" inputmode="numeric" required>
          <button class="btn btn-verde btn-grande" type="submit" data-tipo="entrada">+ Dar entrada</button>
          <button class="btn btn-primario btn-grande" type="submit" data-tipo="saida">− Dar saída</button>
        </form>
      </section>`;
  },

  formulario(p, v, mensagem) {
    const edicao = Boolean(p);
    const voltar = edicao ? `#/produto/${p.id}` : "#/";
    const titulo = edicao ? "Editar produto" : "Novo produto";
    const categorias = ["Mercearia", "Bebidas", "Laticínios", "Frios", "Padaria", "Hortifruti", "Limpeza", "Higiene", "Açougue"]
      .map((c) => `<option value="${c}">`).join("");
    return `
      ${this.aviso(mensagem)}
      <p class="voltar"><a href="${voltar}">← Voltar</a></p>
      <header class="topo"><h1>${titulo}</h1></header>
      <form class="painel form" id="form-produto" novalidate>
        <label for="nome">Nome do produto</label>
        <input id="nome" name="nome" type="text" maxlength="80" value="${esc(v.nome)}" placeholder="Ex.: Arroz Branco Tipo 1 5kg" required>

        <label for="categoria">Categoria</label>
        <input id="categoria" name="categoria" type="text" list="categorias" maxlength="40" value="${esc(v.categoria)}" placeholder="Ex.: Mercearia">
        <datalist id="categorias">${categorias}</datalist>

        <div class="form-linha">
          <div>
            <label for="preco">Preço (R$)</label>
            <input id="preco" name="preco" type="text" inputmode="decimal" value="${esc(v.preco)}" placeholder="0,00" required>
          </div>
          <div>
            <label for="quantidade">Quantidade em estoque</label>
            <input id="quantidade" name="quantidade" type="number" min="0" inputmode="numeric" value="${esc(v.quantidade)}" required>
          </div>
          <div>
            <label for="minimo">Estoque mínimo</label>
            <input id="minimo" name="minimo" type="number" min="0" inputmode="numeric" value="${esc(v.minimo)}" required>
            <small>Abaixo disso, o produto aparece como “estoque baixo”.</small>
          </div>
        </div>

        <div class="form-botoes">
          <button class="btn btn-primario btn-grande" type="submit">${edicao ? "Salvar alterações" : "Cadastrar produto"}</button>
          <a class="btn btn-secundario btn-grande" href="${voltar}">Cancelar</a>
        </div>
      </form>`;
  },

  confirmarExclusao(p) {
    return `
      <p class="voltar"><a href="#/produto/${p.id}">← Voltar</a></p>
      <section class="painel confirma">
        <h1>Remover este produto?</h1>
        <p class="confirma-nome">${esc(p.nome)}</p>
        <p>Ele sai do cadastro de todas as lojas e deixa de aparecer nos relatórios.
           ${p.quantidade > 0
             ? `<strong>Atenção:</strong> ainda há ${unidades(p.quantidade)} em estoque.`
             : "Não há unidades em estoque."}</p>
        <div class="form-botoes">
          <button class="btn btn-perigo btn-grande" id="confirmar-exclusao" type="button">Sim, remover</button>
          <a class="btn btn-secundario btn-grande" href="#/produto/${p.id}">Não, manter</a>
        </div>
      </section>`;
  },

  naoEncontrado() {
    return `
      <section class="painel confirma">
        <h1>Produto não encontrado</h1>
        <p>Ele pode ter sido removido do cadastro.</p>
        <p><a class="btn btn-primario btn-grande" href="#/">Voltar ao estoque</a></p>
      </section>`;
  },
};

// ---------- Aplicação: rotas e eventos ----------

class App {
  constructor(repo, raiz) {
    this.repo = repo;
    this.raiz = raiz;
    this.busca = "";
    this.filtro = "todos";
    this.mensagem = null; // mostrada uma única vez na próxima tela
    window.addEventListener("hashchange", () => this.rotear());
    this.rotear();
  }

  irPara(hash, mensagem) {
    this.mensagem = mensagem ?? null;
    if (location.hash === hash) this.rotear();
    else location.hash = hash;
  }

  tirarMensagem() {
    const m = this.mensagem;
    this.mensagem = null;
    return m;
  }

  desenhar(html, menu) {
    this.raiz.innerHTML = html;
    document.getElementById("menu-estoque").classList.toggle("ativo", menu === "estoque");
    document.getElementById("menu-novo").classList.toggle("ativo", menu === "novo");
    window.scrollTo(0, 0);
  }

  rotear() {
    const partes = (location.hash || "#/").replace(/^#\/?/, "").split("/").filter(Boolean);
    const [rota, idTexto, acao] = partes;

    if (!rota) return this.telaLista();
    if (rota === "novo") return this.telaFormulario(null);
    if (rota === "produto" && /^\d+$/.test(idTexto ?? "")) {
      const p = this.repo.buscar(Number(idTexto));
      if (!p) return this.desenhar(Telas.naoEncontrado(), "estoque");
      if (!acao) return this.telaDetalhe(p);
      if (acao === "editar") return this.telaFormulario(p);
      if (acao === "excluir") return this.telaExclusao(p);
    }
    this.desenhar(Telas.naoEncontrado(), "estoque");
  }

  // --- Lista (Ler) ---
  telaLista() {
    const todos = this.repo.listar();
    this.desenhar(Telas.lista(todos, this.filtro, this.tirarMensagem()), "estoque");

    const campo = document.getElementById("busca");
    campo.value = this.busca;
    const atualizarTabela = () => {
      const termo = this.busca.trim().toLowerCase();
      const visiveis = todos.filter((p) =>
        (!termo || p.nome.toLowerCase().includes(termo) || p.categoria.toLowerCase().includes(termo)) &&
        (this.filtro === "todos" || p.situacao === this.filtro));
      document.getElementById("tabela").innerHTML = Telas.tabela(visiveis);
    };
    atualizarTabela();

    campo.addEventListener("input", () => { this.busca = campo.value; atualizarTabela(); });
    this.raiz.querySelectorAll("[data-filtro]").forEach((botao) =>
      botao.addEventListener("click", () => {
        this.filtro = botao.dataset.filtro;
        this.raiz.querySelectorAll("[data-filtro]").forEach((b) =>
          b.classList.toggle("chip-ativo", b === botao));
        atualizarTabela();
      }));
  }

  // --- Detalhes (Ler) + entrada/saída ---
  telaDetalhe(p) {
    this.desenhar(Telas.detalhe(p, this.tirarMensagem()), "estoque");
    const form = document.getElementById("form-ajuste");
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const entrada = ev.submitter?.dataset.tipo === "entrada";
      try {
        const qtd = lerInteiro(form.quantidade.value, "quantidade");
        if (qtd <= 0) throw new Error("Informe uma quantidade maior que zero.");
        this.repo.ajustarQuantidade(p.id, entrada ? qtd : -qtd);
        const atual = this.repo.buscar(p.id).quantidade;
        this.irPara(`#/produto/${p.id}`, entrada
          ? `Entrada registrada! Agora são ${atual} unidades.`
          : `Saída registrada! Restam ${unidades(atual)}.`);
      } catch (e) {
        this.irPara(`#/produto/${p.id}`, "!" + e.message);
      }
    });
  }

  // --- Formulário (Criar / Atualizar) ---
  telaFormulario(p, valores, erro) {
    const v = valores ?? (p
      ? { nome: p.nome, categoria: p.categoria, preco: String(p.preco.toFixed(2)).replace(".", ","),
          quantidade: p.quantidade, minimo: p.quantidadeMinima }
      : { nome: "", categoria: "", preco: "", quantidade: 0, minimo: 10 });
    this.desenhar(Telas.formulario(p, v, erro ?? this.tirarMensagem()), p ? "estoque" : "novo");

    const form = document.getElementById("form-produto");
    form.nome.focus();
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const digitado = {
        nome: form.nome.value, categoria: form.categoria.value, preco: form.preco.value,
        quantidade: form.quantidade.value, minimo: form.minimo.value,
      };
      try {
        const dados = {
          nome: digitado.nome,
          categoria: digitado.categoria,
          preco: lerPreco(digitado.preco),
          quantidade: lerInteiro(digitado.quantidade, "quantidade"),
          quantidadeMinima: lerInteiro(digitado.minimo, "estoque mínimo"),
        };
        if (p) {
          this.repo.atualizar(p.id, dados);
          this.irPara(`#/produto/${p.id}`, "Produto atualizado!");
        } else {
          const novo = this.repo.criar(dados);
          this.irPara(`#/produto/${novo.id}`, "Produto cadastrado!");
        }
      } catch (e) {
        this.telaFormulario(p, digitado, "!" + e.message);
      }
    });
  }

  // --- Excluir ---
  telaExclusao(p) {
    this.desenhar(Telas.confirmarExclusao(p), "estoque");
    document.getElementById("confirmar-exclusao").addEventListener("click", () => {
      this.repo.excluir(p.id);
      this.irPara("#/", "Produto removido do cadastro!");
    });
  }
}

new App(new RepositorioProdutos(), document.getElementById("app"));
