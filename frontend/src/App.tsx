import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Banknote, CheckCircle2, Download, Eye, EyeOff, LockKeyhole, Plus, RefreshCcw, Search, Stamp, Users } from 'lucide-react';
import { api, clearToken, getToken, login, setToken } from './api';
import type { Advance, Dashboard, Employee, Status, Tipo } from './types';

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const date = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });
const colors = ['#0f4c81', '#1e78b8', '#475569', '#14b8a6', '#f59e0b'];
const tipos: Tipo[] = ['adiantamento', 'emprestimo', 'compra', 'ferramentas', 'outro'];
const statuses: Array<Status | ''> = ['', 'aberto', 'parcial', 'quitado', 'cancelado'];

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

export function App() {
  const [token, setSessionToken] = useState(() => getToken());
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status | ''>('');
  const [tipo, setTipo] = useState<Tipo | ''>('');
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
      const [dash, funcs, lancamentos] = await Promise.all([
        api<Dashboard>('/dashboard'),
        api<Employee[]>('/employees'),
        api<Advance[]>(`/advances?${query.toString()}`)
      ]);
      setDashboard(dash);
      setEmployees(funcs);
      setAdvances(lancamentos);
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
  }, [search, status, tipo]);

  if (!token) {
    return <LoginScreen onLogin={(newToken) => { setToken(newToken); setSessionToken(newToken); }} />;
  }

  const employeeChart = asChartValue(dashboard?.porFuncionario ?? [], ['saldo_aberto', 'total_emprestado']);
  const typeChart = asChartValue(dashboard?.porTipo ?? [], ['saldo_aberto', 'total_emprestado']);

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <span className="eyebrow">Studio 2</span>
          <h1>Controle de adiantamentos</h1>
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
      </section>

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
  const [form, setForm] = useState({ funcionarioId: '', tipo: 'adiantamento' as Tipo, descricao: '', valorOriginal: '', dataVencimento: '', parcelasTotal: '1', observacoes: '' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!form.funcionarioId && employees[0]) setForm((current) => ({ ...current, funcionarioId: employees[0].id }));
  }, [employees, form.funcionarioId]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    await api('/advances', { method: 'POST', body: JSON.stringify(nulls({ ...form, valorOriginal: Number(form.valorOriginal), parcelasTotal: Number(form.parcelasTotal), dataVencimento: form.dataVencimento || null })) });
    setForm((current) => ({ ...current, descricao: '', valorOriginal: '', dataVencimento: '', parcelasTotal: '1', observacoes: '' }));
    await onSaved();
    setBusy(false);
  }

  return (
    <article className="panel">
      <div className="panel-title"><h2>Novo lançamento</h2><span>empréstimo, compra ou adiantamento</span></div>
      <form className="dense-form" onSubmit={submit}>
        <select required value={form.funcionarioId} onChange={(event) => setForm({ ...form, funcionarioId: event.target.value })}><option value="">Selecione funcionário</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.nome}</option>)}</select>
        <div className="form-row"><select value={form.tipo} onChange={(event) => setForm({ ...form, tipo: event.target.value as Tipo })}>{tipos.map((item) => <option key={item} value={item}>{item}</option>)}</select><input required type="number" min="0.01" step="0.01" value={form.valorOriginal} onChange={(event) => setForm({ ...form, valorOriginal: event.target.value })} placeholder="Valor" /></div>
        <input required value={form.descricao} onChange={(event) => setForm({ ...form, descricao: event.target.value })} placeholder="Descrição" />
        <div className="form-row"><input type="date" value={form.dataVencimento} onChange={(event) => setForm({ ...form, dataVencimento: event.target.value })} /><input type="number" min="1" value={form.parcelasTotal} onChange={(event) => setForm({ ...form, parcelasTotal: event.target.value })} placeholder="Parcelas" /></div>
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
    const amount = Number(payment[id]);
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
            {columns.vencimento && <td data-label="Vencimento">{toDate(item.data_vencimento)}</td>}
            {columns.status && <td data-label="Status"><StatusBadge status={item.status_calculado} /></td>}
            <td data-label="Ações" className="actions-cell">
              {item.status_calculado === 'quitado' ? <span className="stamp-label">QUITADO</span> : <><div className="pay-inline"><input type="number" min="0.01" step="0.01" value={payment[item.id] ?? ''} onChange={(event) => setPayment({ ...payment, [item.id]: event.target.value })} placeholder="R$" /><button className="ghost small" disabled={busyId === item.id} onClick={() => void pay(item.id)}>Pagar</button></div><button className="settle" disabled={busyId === item.id} onClick={() => void settle(item.id)}><Stamp size={15} /> Carimbar quitado</button></>}
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