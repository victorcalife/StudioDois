import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, Banknote, CalendarClock, CheckCircle2, Download, Eye, EyeOff, LockKeyhole, Plus, RefreshCcw, Search, Stamp, Users } from 'lucide-react';
import { api, clearToken, getToken, login, setToken } from './api';
import type { Advance, Dashboard, Employee, Receivable, ReceivableRange, Status, Tipo } from './types';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });
const colors = ['#0f4c81', '#1e78b8', '#475569', '#14b8a6', '#f59e0b'];
const tipos: Tipo[] = ['adiantamento', 'emprestimo', 'compra', 'ferramentas', 'outro'];
const statuses: Array<Status | ''> = ['', 'aberto', 'parcial', 'quitado', 'cancelado'];
const receivableRanges: Array<{ value: ReceivableRange | ''; label: string }> = [
  { value: '', label: 'Todos recebíveis' },
  { value: 'vencida', label: 'Vencidos' },
  { value: 'proximos_7_dias', label: 'Próximos 7 dias' },
  { value: 'proximos_30_dias', label: 'Próximos 30 dias' },
  { value: 'mes_atual', label: 'Mês atual' },
  { value: 'futura', label: 'Futuros' },
  { value: 'paga', label: 'Pagos' }
];

const columnLabels = {
  funcionario: 'Funcionário',
  tipo: 'Tipo',
  descricao: 'Descrição',
  valor: 'Valor',
  pago: 'Pago',
  saldo: 'Saldo',
  vencimento: 'Vencimento',
  status: 'Status'
};

type VisibleColumn = keyof typeof columnLabels;

function toMoney(value: string | number) {
  return money.format(Number(value ?? 0));
}

function formatCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  return money.format(Number(digits) / 100);
}

function parseCurrencyInput(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return 0;
  return Number((Number(digits) / 100).toFixed(2));
}

function currencyInputFromNumber(value: string | number) {
  const parsed = Number(value);
  return parsed > 0 ? money.format(parsed) : '';
}

function toDate(value: string | null) {
  return value ? date.format(new Date(value)) : 'Sem data';
}

function asChartValue<T extends Record<string, string>>(rows: T[], keys: Array<keyof T>) {
  return rows.map((row) => {
    const parsed: Record<string, string | number> = { ...row };
    for (const key of keys) {
      parsed[String(key)] = Number(row[key] ?? 0);
    }
    return parsed;
  });
}

function addDays(dateValue: string, days: number) {
  const [year, month, day] = dateValue.split('-').map(Number);
  const dateValueUtc = new Date(Date.UTC(year, month - 1, day + days));
  return dateValueUtc.toISOString().slice(0, 10);
}

function splitMoney(total: number, count: number) {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  const remainder = cents - base * count;
  return Array.from({ length: count }, (_, index) => ((base + (index < remainder ? 1 : 0)) / 100).toFixed(2));
}

export function App() {
  const [token, setSessionToken] = useState(() => getToken());
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [receivables, setReceivables] = useState<Receivable[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status | ''>('');
  const [tipo, setTipo] = useState<Tipo | ''>('');
  const [receivableRange, setReceivableRange] = useState<ReceivableRange | ''>('');
  const [columns, setColumns] = useState<Record<VisibleColumn, boolean>>({
    funcionario: true,
    tipo: true,
    descricao: true,
    valor: true,
    pago: true,
    saldo: true,
    vencimento: true,
    status: true
  });

  async function loadData() {
    if (!getToken()) return;
    setLoading(true);
    setMessage('');
    try {
      const query = new URLSearchParams();
      if (search) query.set('search', search);
      if (status) query.set('status', status);
      if (tipo) query.set('tipo', tipo);
      const receivableQuery = new URLSearchParams();
      if (search) receivableQuery.set('search', search);
      if (receivableRange) receivableQuery.set('faixa', receivableRange);
      const [dash, funcs, lancamentos, parcelas] = await Promise.all([
        api<Dashboard>('/dashboard'),
        api<Employee[]>('/employees'),
        api<Advance[]>(`/advances?${query.toString()}`),
        api<Receivable[]>(`/advances/receivables?${receivableQuery.toString()}`)
      ]);
      setDashboard(dash);
      setEmployees(funcs);
      setAdvances(lancamentos);
      setReceivables(parcelas);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Erro ao carregar dados.');
      if (!getToken()) setSessionToken(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [token]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadData(), 300);
    return () => window.clearTimeout(timer);
  }, [search, status, tipo, receivableRange]);

  if (!token) {
    return <LoginScreen onLogin={(newToken) => { setToken(newToken); setSessionToken(newToken); }} />;
  }

  const employeeChart = asChartValue(dashboard?.porFuncionario ?? [], ['saldo_aberto', 'total_emprestado']);
  const typeChart = asChartValue(dashboard?.porTipo ?? [], ['saldo_aberto', 'total_emprestado']);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Manão, use as nádegas para dar fim nisso que você chama de planilha!</span>
          <h1>Sistema de Controle de adiantamentos :: Studio Dois</h1>
          <p>Gestão simples de valores emprestados, pagamentos e quitações por funcionário.</p>
        </div>
        <div className="top-actions">
          <button className="ghost" onClick={() => void loadData()} disabled={loading}><RefreshCcw size={16} /> Atualizar</button>
          <button className="ghost" onClick={() => { clearToken(); setSessionToken(null); }}>Sair</button>
        </div>
      </header>

      {message && <div className="alert">{message}</div>}

      <section className="kpi-grid">
        <Kpi icon={<Users />} label="Funcionários ativos" value={dashboard?.resumo.total_funcionarios ?? 0} />
        <Kpi icon={<Banknote />} label="Total emprestado" value={toMoney(dashboard?.resumo.total_emprestado ?? 0)} />
        <Kpi icon={<CheckCircle2 />} label="Total pago" value={toMoney(dashboard?.resumo.total_pago ?? 0)} />
        <Kpi icon={<Stamp />} label="Saldo aberto" value={toMoney(dashboard?.resumo.saldo_aberto ?? 0)} highlight />
        <Kpi icon={<AlertTriangle />} label="Vencido" value={toMoney(dashboard?.resumo.valor_vencido ?? 0)} highlight />
        <Kpi icon={<CalendarClock />} label="Próximos 7 dias" value={toMoney(dashboard?.resumo.valor_proximos_7_dias ?? 0)} />
        <Kpi icon={<CalendarClock />} label="Próximos 30 dias" value={toMoney(dashboard?.resumo.valor_proximos_30_dias ?? 0)} />
      </section>

      <ReceivablesPanel receivables={receivables} range={receivableRange} setRange={setReceivableRange} onSaved={loadData} />

      <section className="dashboard-grid">
        <article className="panel chart-panel">
          <div className="panel-title"><h2>Maiores saldos por funcionário</h2><span>{dashboard?.resumo.lancamentos_abertos ?? 0} em aberto</span></div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={employeeChart} margin={{ top: 8, right: 8, left: 0, bottom: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#dbe4ee" />
              <XAxis dataKey="funcionario_nome" angle={-18} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(value) => `${Number(value) / 1000}k`} width={46} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(value) => toMoney(Number(value))} />
              <Bar dataKey="saldo_aberto" name="Saldo aberto" fill="#0f4c81" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </article>
        <article className="panel chart-panel compact-chart">
          <div className="panel-title"><h2>Distribuição por tipo</h2><span>{dashboard?.resumo.lancamentos_quitados ?? 0} quitados</span></div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={typeChart} dataKey="total_emprestado" nameKey="tipo" innerRadius={56} outerRadius={92} paddingAngle={3}>
                {typeChart.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}
              </Pie>
              <Tooltip formatter={(value) => toMoney(Number(value))} />
            </PieChart>
          </ResponsiveContainer>
          <div className="legend-list">
            {typeChart.map((item, index) => <span key={item.tipo}><i style={{ background: colors[index % colors.length] }} />{item.tipo}</span>)}
          </div>
        </article>
      </section>

      <section className="work-grid">
        <EmployeePanel employees={employees} onSaved={loadData} />
        <AdvancePanel employees={employees} onSaved={loadData} />
      </section>

      <section className="panel ledger-panel">
        <div className="ledger-head">
          <div>
            <h2>Lançamentos</h2>
            <p>Filtre, exporte e carimbe como quitado quando o valor estiver resolvido.</p>
          </div>
          <div className="filters">
            <label className="search-field"><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar funcionário ou descrição" /></label>
            <select value={status} onChange={(event) => setStatus(event.target.value as Status | '')}>{statuses.map((item) => <option key={item || 'todos'} value={item}>{item || 'Todos os status'}</option>)}</select>
            <select value={tipo} onChange={(event) => setTipo(event.target.value as Tipo | '')}><option value="">Todos os tipos</option>{tipos.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            <button className="primary small" onClick={() => exportCsv(advances)}><Download size={15} /> CSV</button>
          </div>
        </div>
        <ColumnToggles columns={columns} setColumns={setColumns} />
        <LedgerTable advances={advances} columns={columns} onSaved={loadData} />
      </section>
    </main>
  );
}

function LoginScreen({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const response = await login(password);
      onLogin(response.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark"><LockKeyhole /></div>
        <span className="eyebrow">Studio 2</span>
        <h1>Acesso ao controle</h1>
        <p>Uma senha única para abrir o painel financeiro de adiantamentos.</p>
        <label className="password-field">
          <input type={show ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Digite a senha" autoFocus />
          <button type="button" onClick={() => setShow((current) => !current)}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
        </label>
        {error && <div className="alert compact">{error}</div>}
        <button className="primary" disabled={busy || !password}>{busy ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </main>
  );
}

function Kpi({ icon, label, value, highlight = false }: { icon: JSX.Element; label: string; value: string | number; highlight?: boolean }) {
  return <article className={`kpi ${highlight ? 'highlight' : ''}`}><div className="kpi-icon">{icon}</div><span>{label}</span><strong>{value}</strong></article>;
}

function ReceivablesPanel({ receivables, range, setRange, onSaved }: { receivables: Receivable[]; range: ReceivableRange | ''; setRange: (value: ReceivableRange | '') => void; onSaved: () => Promise<void> }) {
  const [busyId, setBusyId] = useState('');
  const [receivedValues, setReceivedValues] = useState<Record<string, string>>({});
  const [closeInstallment, setCloseInstallment] = useState<Record<string, boolean>>({});

  async function receive(id: string) {
    setBusyId(id);
    const typedValue = parseCurrencyInput(receivedValues[id] ?? '');
    await api(`/advances/installments/${id}/receive`, { method: 'POST', body: JSON.stringify({
      ...(typedValue > 0 ? { valor: typedValue } : {}),
      fecharParcela: closeInstallment[id] === true,
      criarParcelaResidual: true
    }) });
    setReceivedValues({ ...receivedValues, [id]: '' });
    setCloseInstallment({ ...closeInstallment, [id]: false });
    await onSaved();
    setBusyId('');
  }

  return (
    <section className="panel receivables-panel">
      <div className="ledger-head">
        <div>
          <h2>Agenda de recebimentos</h2>
          <p>Veja quem deve pagar nos próximos dias, semanas e mês, com cada parcela em sua data.</p>
        </div>
        <div className="filters">
          <select value={range} onChange={(event) => setRange(event.target.value as ReceivableRange | '')}>{receivableRanges.map((item) => <option key={item.value || 'todos-recebiveis'} value={item.value}>{item.label}</option>)}</select>
        </div>
      </div>
      <div className="receivable-grid">
        {receivables.map((item) => <article key={item.id} className={`receivable-card ${item.faixa_recebimento}`}>
          <div>
            <strong>{item.funcionario_nome}</strong>
            <span>{item.descricao}</span>
          </div>
          <div>
            <small>Parcela {item.numero}</small>
            <b>{toMoney(item.saldo_parcela)}</b>
          </div>
          <div>
            <small>Vencimento</small>
            <b>{toDate(item.data_vencimento)}</b>
          </div>
          <StatusChip range={item.faixa_recebimento} />
          {item.faixa_recebimento === 'paga' ? <span className="stamp-label compact-stamp">PAGO</span> : <div className="receive-action"><input type="text" inputMode="numeric" value={receivedValues[item.id] ?? ''} onChange={(event) => setReceivedValues({ ...receivedValues, [item.id]: formatCurrencyInput(event.target.value) })} placeholder="Recebido" /><label className="tiny-check"><input type="checkbox" checked={closeInstallment[item.id] === true} onChange={(event) => setCloseInstallment({ ...closeInstallment, [item.id]: event.target.checked })} />Fechar e jogar diferença</label><button className="primary small" disabled={busyId === item.id} onClick={() => void receive(item.id)}><CheckCircle2 size={15} /> Receber</button></div>}
        </article>)}
      </div>
      {receivables.length === 0 && <div className="empty-state">Nenhum recebível encontrado para o filtro atual.</div>}
    </section>
  );
}

function StatusChip({ range }: { range: ReceivableRange }) {
  const labels: Record<ReceivableRange, string> = {
    vencida: 'Vencida',
    proximos_7_dias: '7 dias',
    proximos_30_dias: '30 dias',
    mes_atual: 'Mês atual',
    futura: 'Futura',
    paga: 'Paga',
    cancelada: 'Cancelada'
  };
  return <span className={`receivable-status ${range}`}>{labels[range]}</span>;
}

function EmployeePanel({ employees, onSaved }: { employees: Employee[]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ nome: '', cargo: '', telefone: '', observacoes: '' });
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    await api('/employees', { method: 'POST', body: JSON.stringify(nulls(form)) });
    setForm({ nome: '', cargo: '', telefone: '', observacoes: '' });
    await onSaved();
    setBusy(false);
  }

  return (
    <article className="panel">
      <div className="panel-title"><h2>Funcionários</h2><span>{employees.length} cadastrados</span></div>
      <form className="dense-form" onSubmit={submit}>
        <input required value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} placeholder="Nome do funcionário" />
        <div className="form-row"><input value={form.cargo} onChange={(event) => setForm({ ...form, cargo: event.target.value })} placeholder="Cargo" /><input value={form.telefone} onChange={(event) => setForm({ ...form, telefone: event.target.value })} placeholder="Telefone" /></div>
        <input value={form.observacoes} onChange={(event) => setForm({ ...form, observacoes: event.target.value })} placeholder="Observação rápida" />
        <button className="primary" disabled={busy}><Plus size={16} /> Cadastrar funcionário</button>
      </form>
      <div className="mini-list">
        {employees.slice(0, 6).map((employee) => <div key={employee.id}><strong>{employee.nome}</strong><span>{toMoney(employee.saldo_aberto)} aberto</span></div>)}
      </div>
    </article>
  );
}

function AdvancePanel({ employees, onSaved }: { employees: Employee[]; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ funcionarioId: '', tipo: 'adiantamento' as Tipo, descricao: '', valorOriginal: '', dataVencimento: '', parcelasTotal: '1', intervaloDias: '30', observacoes: '' });
  const [installments, setInstallments] = useState<Array<{ numero: number; dataVencimento: string; valorPrevisto: string }>>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!form.funcionarioId && employees[0]) setForm((current) => ({ ...current, funcionarioId: employees[0].id }));
  }, [employees, form.funcionarioId]);

  useEffect(() => {
    const total = parseCurrencyInput(form.valorOriginal);
    const count = Number(form.parcelasTotal);
    const interval = Number(form.intervaloDias);
    if (!total || !count || !interval || !form.dataVencimento) {
      setInstallments([]);
      return;
    }
    const values = splitMoney(total, count);
    setInstallments(values.map((value, index) => ({ numero: index + 1, valorPrevisto: currencyInputFromNumber(value), dataVencimento: addDays(form.dataVencimento, index * interval) })));
  }, [form.valorOriginal, form.parcelasTotal, form.dataVencimento, form.intervaloDias]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    await api('/advances', { method: 'POST', body: JSON.stringify(nulls({
      ...form,
      valorOriginal: parseCurrencyInput(form.valorOriginal),
      parcelasTotal: installments.length,
      intervaloDias: Number(form.intervaloDias),
      dataVencimento: form.dataVencimento || null,
      parcelasRecebimento: installments.map((item) => ({ numero: item.numero, valorPrevisto: parseCurrencyInput(item.valorPrevisto), dataVencimento: item.dataVencimento }))
    })) });
    setForm((current) => ({ ...current, descricao: '', valorOriginal: '', dataVencimento: '', parcelasTotal: '1', intervaloDias: '30', observacoes: '' }));
    setInstallments([]);
    await onSaved();
    setBusy(false);
  }

  return (
    <article className="panel">
      <div className="panel-title"><h2>Novo lançamento</h2><span>empréstimo, compra ou adiantamento</span></div>
      <form className="dense-form" onSubmit={submit}>
        <select required value={form.funcionarioId} onChange={(event) => setForm({ ...form, funcionarioId: event.target.value })}><option value="">Selecione funcionário</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.nome}</option>)}</select>
        <div className="form-row"><select value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value as Tipo })}>{tipos.map((item) => <option key={item} value={item}>{item}</option>)}</select><input required type="text" inputMode="numeric" value={form.valorOriginal} onChange={(event) => setForm({ ...form, valorOriginal: formatCurrencyInput(event.target.value) })} placeholder="R$ 0,00" /></div>
        <input required value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} placeholder="Descrição" />
        <div className="form-row">
          <label className="field-with-label"><span>1ª cobrança</span><input required type="date" value={form.dataVencimento} onChange={(event) => setForm({ ...form, dataVencimento: event.target.value })} /></label>
          <label className="field-with-label"><span>Nº parcelas</span><input type="number" min="1" max="120" value={form.parcelasTotal} onChange={(event) => setForm({ ...form, parcelasTotal: event.target.value })} /></label>
          <label className="field-with-label"><span>Cobrar a cada (dias)</span><input type="number" min="1" max="3650" value={form.intervaloDias} onChange={(event) => setForm({ ...form, intervaloDias: event.target.value })} /></label>
        </div>
        {installments.length > 0 && <div className="installments-editor">
          <strong>Datas de recebimento</strong>
          {installments.map((item, index) => <div className="installment-row" key={item.numero}>
            <span>{item.numero}ª</span>
            <input type="date" value={item.dataVencimento} onChange={(event) => setInstallments((current) => current.map((parcel, parcelIndex) => parcelIndex === index ? { ...parcel, dataVencimento: event.target.value } : parcel))} />
            <input type="text" inputMode="numeric" value={item.valorPrevisto} onChange={(event) => setInstallments((current) => current.map((parcel, parcelIndex) => parcelIndex === index ? { ...parcel, valorPrevisto: formatCurrencyInput(event.target.value) } : parcel))} placeholder="R$ 0,00" />
          </div>)}
        </div>}
        <input value={form.observacoes} onChange={(event) => setForm({ ...form, observacoes: event.target.value })} placeholder="Observação" />
        <button className="primary" disabled={busy || employees.length === 0}><Plus size={16} /> Lançar valor</button>
      </form>
    </article>
  );
}

function ColumnToggles({ columns, setColumns }: { columns: Record<VisibleColumn, boolean>; setColumns: (value: Record<VisibleColumn, boolean>) => void }) {
  return <div className="column-toggles">{(Object.keys(columnLabels) as VisibleColumn[]).map((key) => <button key={key} className={columns[key] ? 'active' : ''} onClick={() => setColumns({ ...columns, [key]: !columns[key] })}>{columnLabels[key]}</button>)}</div>;
}

function LedgerTable({ advances, columns, onSaved }: { advances: Advance[]; columns: Record<VisibleColumn, boolean>; onSaved: () => Promise<void> }) {
  const [payment, setPayment] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState('');
  const visible = useMemo(() => Object.values(columns).some(Boolean), [columns]);

  async function settle(id: string) {
    setBusyId(id);
    await api(`/advances/${id}/settle`, { method: 'POST' });
    await onSaved();
    setBusyId('');
  }

  async function pay(id: string) {
    const amount = parseCurrencyInput(payment[id] ?? '');
    if (!amount) return;
    setBusyId(id);
    await api(`/advances/${id}/payments`, { method: 'POST', body: JSON.stringify({ valor: amount }) });
    setPayment({ ...payment, [id]: '' });
    await onSaved();
    setBusyId('');
  }

  if (!visible) return <div className="empty-state">Ative ao menos uma coluna para visualizar a tabela.</div>;

  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.funcionario && <th>Funcionário</th>}{columns.tipo && <th>Tipo</th>}{columns.descricao && <th>Descrição</th>}{columns.valor && <th>Valor</th>}{columns.pago && <th>Pago</th>}{columns.saldo && <th>Saldo</th>}{columns.vencimento && <th>Vencimento</th>}{columns.status && <th>Status</th>}<th>Ações</th></tr></thead>
        <tbody>
          {advances.map((item) => <tr key={item.id} className={item.status_calculado === 'quitado' ? 'settled-row' : ''}>
            {columns.funcionario && <td data-label="Funcionário"><strong>{item.funcionario_nome}</strong><small>{item.funcionario_cargo || 'Sem cargo'}</small></td>}
            {columns.tipo && <td data-label="Tipo"><span className="type-pill">{item.tipo}</span></td>}
            {columns.descricao && <td data-label="Descrição">{item.descricao}<small>{item.parcelas_total} parcela(s)</small></td>}
            {columns.valor && <td data-label="Valor">{toMoney(item.valor_original)}</td>}
            {columns.pago && <td data-label="Pago">{toMoney(item.valor_pago)}</td>}
            {columns.saldo && <td data-label="Saldo"><strong>{toMoney(item.saldo_aberto)}</strong></td>}
            {columns.vencimento && <td data-label="Vencimento">{toDate(item.proximo_vencimento ?? item.data_vencimento)}<small>{item.parcelas_abertas ?? 0} parcela(s) aberta(s)</small></td>}
            {columns.status && <td data-label="Status"><StatusBadge status={item.status_calculado} /></td>}
            <td data-label="Ações" className="actions-cell">
              {item.status_calculado === 'quitado' ? <span className="stamp-label">QUITADO</span> : <><div className="pay-inline"><input type="text" inputMode="numeric" value={payment[item.id] ?? ''} onChange={(event) => setPayment({ ...payment, [item.id]: formatCurrencyInput(event.target.value) })} placeholder="R$ 0,00" /><button className="ghost small" disabled={busyId === item.id} onClick={() => void pay(item.id)}>Pagar</button></div><button className="settle" disabled={busyId === item.id} onClick={() => void settle(item.id)}><Stamp size={15} /> Carimbar quitado</button></>}
            </td>
          </tr>)}
        </tbody>
      </table>
      {advances.length === 0 && <div className="empty-state">Nenhum lançamento encontrado para os filtros atuais.</div>}
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  return <span className={`status ${status}`}>{status}</span>;
}

function nulls<T extends Record<string, unknown>>(data: T) {
  return Object.fromEntries(Object.entries(data).map(([key, value]) => [key, value === '' ? null : value]));
}

function exportCsv(rows: Advance[]) {
  const header = ['funcionario', 'tipo', 'descricao', 'valor_original', 'valor_pago', 'saldo_aberto', 'vencimento', 'status'];
  const csv = [header.join(';'), ...rows.map((row) => [row.funcionario_nome, row.tipo, row.descricao, row.valor_original, row.valor_pago, row.saldo_aberto, row.data_vencimento ?? '', row.status_calculado].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';'))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `studio2-lancamentos-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}