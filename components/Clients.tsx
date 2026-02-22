
import React, { useState, useMemo, useRef } from 'react';
import { Client, InternalUser, Project } from '../types';
import { getNextClientCode, syncClient, AppDB } from '../storage';

interface ClientsProps {
  db: AppDB;
  setDb: (db: AppDB) => void;
  currentUser: InternalUser;
  theme: 'dark' | 'light';
}

export const Clients: React.FC<ClientsProps> = ({ db, setDb, currentUser, theme }) => {
  const [showModal, setShowModal] = useState(false);
  const [search, setSearch] = useState('');
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [viewingClient, setViewingClient] = useState<Client | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState<'PF' | 'PJ'>('PF');
  const [status, setStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');
  const [cpfCnpj, setCpfCnpj] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [customCode, setCustomCode] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');

  // Address Fields
  const [zipCode, setZipCode] = useState('');
  const [address, setAddress] = useState('');
  const [number, setNumber] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [complement, setComplement] = useState('');
  const [contacts, setContacts] = useState<import('../types').ClientContact[]>([]);

  const resetForm = () => {
    setName('');
    setType('PF');
    setStatus('ACTIVE');
    setCpfCnpj('');
    setEmail('');
    setPhone('');
    setCustomCode('');
    setPhotoUrl('');
    setZipCode('');
    setAddress('');
    setNumber('');
    setNeighborhood('');
    setCity('');
    setState('');
    setComplement('');
    setContacts([]);
    setEditingClient(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 1 * 1024 * 1024) {
        alert("Imagem muito grande! Máximo 1MB.");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => setPhotoUrl(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const removePhoto = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Deseja realmente remover a foto deste cliente?")) {
      setPhotoUrl('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    setName(client.name);
    setType(client.type || 'PF');
    setStatus(client.status);
    setCpfCnpj(client.cpfCnpj || '');
    setEmail(client.email || '');
    setPhone(client.phone || '');
    setCustomCode(client.code);
    setPhotoUrl(client.photoUrl || '');
    setZipCode(client.zipCode || '');
    setAddress(client.address || '');
    setNumber(client.number || '');
    setNeighborhood(client.neighborhood || '');
    setCity(client.city || '');
    setState(client.state || '');
    setComplement(client.complement || '');
    setContacts(client.contacts || []);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextCode = customCode || (editingClient ? editingClient.code : getNextClientCode(db.clients));
    const finalCode = nextCode.padStart(3, '0');

    if (db.clients.some((c: Client) => c.code === finalCode && c.id !== editingClient?.id)) {
      alert('Código já existe!');
      return;
    }

    const clientData: Client = {
      id: editingClient?.id || crypto.randomUUID(),
      workspaceId: currentUser.workspaceId,
      code: finalCode,
      name,
      type,
      status,
      photoUrl,
      cpfCnpj,
      email,
      phone,
      zipCode,
      address,
      number,
      neighborhood,
      city,
      state,
      complement,
      contacts
    };

    try {
      await syncClient(clientData);

      let newClients;
      if (editingClient) {
        newClients = db.clients.map((c: Client) => c.id === editingClient.id ? clientData : c);
      } else {
        newClients = [...db.clients, clientData];
      }

      setDb({ ...db, clients: newClients });
      setShowModal(false);
      resetForm();
    } catch (err: any) {
      alert("Erro ao salvar no Supabase: " + (err.message || "Erro desconhecido"));
    }
  };

  const handleAddContact = () => {
    setContacts([...contacts, { id: crypto.randomUUID(), name: '', position: '', department: '', email: '', phone: '' }]);
  };

  const handleUpdateContact = (id: string, field: string, value: string) => {
    setContacts(contacts.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const handleRemoveContact = (id: string) => {
    setContacts(contacts.filter(c => c.id !== id));
  };

  const clientProjectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    db.projects.forEach((p: Project) => {
      counts[p.clientId] = (counts[p.clientId] || 0) + 1;
    });
    return counts;
  }, [db.projects]);

  const filteredClients = useMemo(() => {
    return db.clients.filter((c: Client) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.code.includes(search)
    ).sort((a: Client, b: Client) => parseInt(a.code) - parseInt(b.code));
  }, [db.clients, search]);

  const InfoField = ({ label, value, icon }: { label: string, value: string, icon: React.ReactNode }) => (
    <div className="bg-white dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-100 dark:border-white/5 shadow-sm transition-all hover:bg-slate-50 dark:hover:bg-slate-800/60">
      <div className="flex items-center space-x-3 mb-2">
        <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-lg text-indigo-600 dark:text-indigo-400">
          {icon}
        </div>
        <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      <p className="text-sm font-bold text-slate-900 dark:text-white transition-colors">{value}</p>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight transition-colors">Base de Clientes</h1>
        <button
          onClick={() => { resetForm(); setShowModal(true); }}
          className="px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 hover:bg-indigo-700 transition flex items-center"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
          Adicionar Cliente
        </button>
      </div>

      <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-all duration-500">
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 transition-colors">
          <div className="relative max-w-md">
            <input
              type="text"
              placeholder="Pesquisar por nome ou código..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
            />
            <svg className="w-5 h-5 absolute left-3 top-2.5 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/30 text-[10px] font-black uppercase tracking-widest text-slate-500 transition-colors">
                <th className="px-8 py-4">Código</th>
                <th className="px-8 py-4">Cliente</th>
                <th className="px-8 py-4">Tipo</th>
                <th className="px-8 py-4 text-center">Status</th>
                <th className="px-8 py-4 text-center">Projetos</th>
                <th className="px-8 py-4 text-right">Editar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 transition-colors">
              {filteredClients.map((client: Client) => (
                <tr key={client.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors group">
                  <td className="px-8 py-5">
                    <span className="font-mono text-[10px] bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded border border-slate-200 dark:border-slate-700 font-bold transition-colors">
                      #{client.code.padStart(3, '0')}
                    </span>
                  </td>
                  <td className="px-8 py-5">
                    <div className="flex items-center space-x-3">
                      <div
                        className="flex items-center space-x-3 cursor-pointer group/name"
                        onClick={() => setViewingClient(client)}
                      >
                        {client.photoUrl ? (
                          <img src={client.photoUrl} className="w-8 h-8 rounded-full object-cover ring-1 ring-slate-200 dark:ring-slate-700 transition-transform group-hover/name:scale-110" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-400 dark:text-slate-400 group-hover/name:bg-indigo-600 group-hover/name:text-white transition-colors">
                            {client.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="font-bold text-slate-900 dark:text-slate-100 group-hover/name:text-indigo-600 dark:group-hover/name:text-indigo-400 transition-colors">{client.name}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-5">
                    <span className={`inline-block px-2.5 py-1 rounded-md text-[9px] font-black uppercase tracking-widest border shadow-sm ${client.type === 'PF'
                      ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20'
                      : 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20'
                      }`}>
                      {client.type}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className={`inline-block min-w-[80px] px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${client.status === 'ACTIVE'
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                      : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20'
                      }`}>
                      {client.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-center">
                    <span className="inline-flex items-center justify-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 w-8 h-8 rounded-lg text-[10px] font-black text-slate-400">
                      {clientProjectCounts[client.id] || 0}
                    </span>
                  </td>
                  <td className="px-8 py-5 text-right">
                    <button
                      onClick={() => openEdit(client)}
                      className="p-2 text-slate-400 hover:text-indigo-600 dark:text-slate-500 dark:hover:text-white transition-colors bg-slate-100 dark:bg-slate-800/50 rounded-lg shadow-sm"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filteredClients.length === 0 && <div className="p-16 text-center text-slate-400 font-medium italic">Nenhum cliente registrado.</div>}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#1e293b] rounded-[32px] shadow-2xl w-full max-w-4xl overflow-hidden border border-slate-200 dark:border-slate-700 transition-all duration-500">
            <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/30 transition-colors">
              <h3 className="font-black text-slate-900 dark:text-white text-sm uppercase tracking-widest">{editingClient ? 'Atualizar Cliente' : 'Novo Cadastro'}</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-white transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <form onSubmit={handleSave} className="p-8 space-y-8 max-h-[85vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
                {/* Coluna da Foto com Overlay de Botões */}
                <div className="flex flex-col items-center space-y-4">
                  <div className="relative group w-48 h-48 rounded-[40px] bg-slate-50 dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 border-dashed overflow-hidden flex items-center justify-center transition-all hover:border-indigo-500/50">
                    {photoUrl ? (
                      <div className="relative w-full h-full group">
                        <img src={photoUrl} className="w-full h-full object-cover transition-all duration-300 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-slate-900/80 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center space-y-3 p-4">
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full py-2 bg-indigo-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-lg hover:bg-indigo-700 transition active:scale-95"
                          >
                            Alterar Foto
                          </button>
                          <button
                            type="button"
                            onClick={removePhoto}
                            className="w-full py-2 bg-rose-600 text-white text-[9px] font-black uppercase tracking-widest rounded-lg shadow-lg hover:bg-rose-700 transition active:scale-95"
                          >
                            Remover Imagem
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center text-slate-400 dark:text-slate-600 pointer-events-none">
                        <svg className="w-12 h-12 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                        <span className="text-[9px] font-black uppercase tracking-widest text-center px-4">Carregar Foto do Cliente</span>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className={`absolute inset-0 cursor-pointer ${photoUrl ? 'hidden' : 'opacity-0'}`}
                    />
                  </div>
                  <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 text-center uppercase tracking-widest leading-relaxed">Formatos: JPG, PNG<br />Máximo 1MB</p>
                </div>

                <div className="md:col-span-2 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Identificador</label>
                      <input
                        type="text"
                        value={customCode}
                        onChange={(e) => setCustomCode(e.target.value.replace(/\D/g, ''))}
                        placeholder={getNextClientCode(db.clients)}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-indigo-600 dark:text-indigo-400 font-mono focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Tipo de Pessoa *</label>
                      <select
                        value={type}
                        onChange={(e: any) => setType(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none font-bold focus:ring-2 focus:ring-indigo-500 transition-all appearance-none"
                      >
                        <option value="PF">Pessoa Física (PF)</option>
                        <option value="PJ">Pessoa Jurídica (PJ)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Nome Completo / Razão Social *</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{type === 'PF' ? 'CPF' : 'CNPJ'}</label>
                      <input
                        type="text"
                        value={cpfCnpj}
                        onChange={(e) => setCpfCnpj(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none font-mono focus:ring-2 focus:ring-indigo-500 transition-all"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Situação</label>
                      <select
                        value={status}
                        onChange={(e: any) => setStatus(e.target.value)}
                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none font-bold focus:ring-2 focus:ring-indigo-500 transition-all appearance-none"
                      >
                        <option value="ACTIVE" className="text-emerald-500">Ativo</option>
                        <option value="INACTIVE" className="text-amber-500">Inativo</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6 pt-6 border-t border-slate-100 dark:border-slate-800 transition-colors">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">E-mail de Contato</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="exemplo@email.com" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Telefone / WhatsApp</label>
                    <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="(00) 00000-0000" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">CEP</label>
                    <input type="text" value={zipCode} onChange={(e) => setZipCode(e.target.value)} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="00000-000" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Rua / Logradouro</label>
                    <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Nº</label>
                    <input type="text" value={number} onChange={(e) => setNumber(e.target.value)} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Bairro</label>
                    <input type="text" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Cidade</label>
                    <input type="text" value={city} onChange={(e) => setCity(e.target.value)} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Estado</label>
                    <input type="text" value={state} onChange={(e) => setState(e.target.value)} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="Ex: SP" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Complemento</label>
                  <input type="text" value={complement} onChange={(e) => setComplement(e.target.value)} className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 transition-all" placeholder="Apto, Sala, Bloco..." />
                </div>
              </div>

              {/* Seção de Contatos - Somente se for PJ */}
              {type === 'PJ' && (
                <div className="space-y-6 pt-6 border-t border-slate-100 dark:border-slate-800 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-widest transition-colors">Contatos da Empresa</h4>
                      <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-1 transition-colors">Gerencie múltiplos contatos por departamento</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddContact}
                      className="px-4 py-2 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 text-indigo-600 dark:text-indigo-400 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all flex items-center"
                    >
                      <svg className="w-3 h-3 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
                      Adicionar Contato
                    </button>
                  </div>

                  <div className="space-y-4">
                    {contacts.map((contact, index) => (
                      <div key={contact.id} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 relative group animate-in fade-in slide-in-from-top-2 duration-300 transition-all">
                        <button
                          type="button"
                          onClick={() => handleRemoveContact(contact.id)}
                          className="absolute -top-2 -right-2 w-6 h-6 bg-rose-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          <div className="lg:col-span-1">
                            <label className="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Nome do Contato</label>
                            <input
                              type="text"
                              value={contact.name}
                              onChange={(e) => handleUpdateContact(contact.id, 'name', e.target.value)}
                              className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                              placeholder="Nome Completo"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Cargo</label>
                            <input
                              type="text"
                              value={contact.position}
                              onChange={(e) => handleUpdateContact(contact.id, 'position', e.target.value)}
                              className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                              placeholder="Ex: Gerente de Projetos"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Setor / Departamento</label>
                            <input
                              type="text"
                              value={contact.department}
                              onChange={(e) => handleUpdateContact(contact.id, 'department', e.target.value)}
                              className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                              placeholder="Ex: Engenharia"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">E-mail</label>
                            <input
                              type="email"
                              value={contact.email}
                              onChange={(e) => handleUpdateContact(contact.id, 'email', e.target.value)}
                              className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                              placeholder="contato@empresa.com"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Telefone</label>
                            <input
                              type="text"
                              value={contact.phone}
                              onChange={(e) => handleUpdateContact(contact.id, 'phone', e.target.value)}
                              className="w-full px-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/50 rounded-lg text-sm text-slate-900 dark:text-white focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                              placeholder="(00) 00000-0000"
                            />
                          </div>
                        </div>
                      </div>
                    ))}

                    {contacts.length === 0 && (
                      <div className="py-10 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 transition-colors">
                        <svg className="w-8 h-8 mb-2 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                        <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Nenhum contato corporativo adicionado</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="pt-6 flex space-x-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-slate-200 dark:hover:text-white transition-all">Cancelar</button>
                <button type="submit" className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-indigo-500/20 hover:bg-indigo-700 transition active:scale-95">Confirmar Alterações</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {viewingClient && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white dark:bg-[#0f172a] rounded-[40px] shadow-2xl w-full max-w-5xl h-[85vh] flex overflow-hidden border border-slate-200 dark:border-white/5 transition-all duration-500">
            {/* Sidebar de Perfil */}
            <div className="w-80 bg-slate-50 dark:bg-slate-900/50 border-r border-slate-100 dark:border-white/5 p-10 flex flex-col items-center transition-colors">
              <div className="relative mb-8">
                {viewingClient.photoUrl ? (
                  <img src={viewingClient.photoUrl} className="w-40 h-40 rounded-[48px] object-cover ring-4 ring-white dark:ring-slate-800 shadow-xl" />
                ) : (
                  <div className="w-40 h-40 rounded-[48px] bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-5xl font-black text-slate-300 dark:text-slate-600">
                    {viewingClient.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className={`absolute -bottom-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shadow-lg ${viewingClient.status === 'ACTIVE' ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-amber-500 text-white border-amber-400'}`}>
                  {viewingClient.status === 'ACTIVE' ? 'Ativo' : 'Inativo'}
                </div>
              </div>

              <h3 className="text-xl font-black text-slate-900 dark:text-white text-center mb-1 leading-tight transition-colors">{viewingClient.name}</h3>
              <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-8 transition-colors">#{viewingClient.code.padStart(3, '0')} • {viewingClient.type}</p>

              <div className="w-full space-y-2">
                <div className="p-4 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-white/5 transition-colors">
                  <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Total de Projetos</span>
                  <span className="text-lg font-black text-slate-900 dark:text-white transition-colors">{clientProjectCounts[viewingClient.id] || 0}</span>
                </div>
                {viewingClient.cpfCnpj && (
                  <div className="p-4 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-white/5 transition-colors">
                    <span className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">{viewingClient.type === 'PF' ? 'CPF' : 'CNPJ'}</span>
                    <span className="text-sm font-mono font-bold text-slate-600 dark:text-slate-300 transition-colors">{viewingClient.cpfCnpj}</span>
                  </div>
                )}
              </div>

              <div className="mt-auto w-full space-y-3">
                <button
                  onClick={() => {
                    const c = viewingClient;
                    setViewingClient(null);
                    openEdit(c);
                  }}
                  className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
                >
                  Editar Perfil
                </button>
                <button
                  onClick={() => setViewingClient(null)}
                  className="w-full py-4 bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded-2xl text-[9px] font-black uppercase tracking-[0.2em] hover:bg-slate-300 dark:hover:text-white transition-all"
                >
                  Fechar Painel
                </button>
              </div>
            </div>

            {/* Conteúdo Detalhado */}
            <div className="flex-1 flex flex-col transition-colors dark:bg-[#0f172a]">
              <div className="p-10 flex-1 overflow-y-auto custom-scrollbar space-y-12">
                {/* Informações Básicas */}
                <section>
                  <div className="flex items-center space-x-4 mb-8">
                    <div className="w-12 h-1 bg-indigo-600 rounded-full"></div>
                    <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-[0.3em] transition-colors">Informações de Contato & Endereço</h4>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-8">
                    <InfoField label="E-mail Principal" value={viewingClient.email || 'Não informado'} icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>} />
                    <InfoField label="Telefone / WhatsApp" value={viewingClient.phone || 'Não informado'} icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>} />
                    <InfoField label="Localização" value={`${viewingClient.city || 'Cidade'} - ${viewingClient.state || 'UF'}`} icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
                    <div className="col-span-full">
                      <InfoField
                        label="Endereço Completo"
                        value={`${viewingClient.address || ''}, ${viewingClient.number || ''} ${viewingClient.complement ? '- ' + viewingClient.complement : ''} - ${viewingClient.neighborhood || ''} - CEP: ${viewingClient.zipCode || ''}`}
                        icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-10V4m-2 4h.01M9 15h.01M9 19h.01M15 15h.01M15 19h.01" /></svg>}
                      />
                    </div>
                  </div>
                </section>

                {/* Contatos Corporativos */}
                {viewingClient.type === 'PJ' && (
                  <section>
                    <div className="flex items-center space-x-4 mb-8">
                      <div className="w-12 h-1 bg-indigo-600 rounded-full"></div>
                      <h4 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-[0.3em] transition-colors">Contatos Administrativos</h4>
                    </div>
                    {viewingClient.contacts && viewingClient.contacts.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {viewingClient.contacts.map((contact) => (
                          <div key={contact.id} className="bg-slate-50 dark:bg-slate-900/40 border border-slate-100 dark:border-white/5 rounded-[24px] p-6 hover:border-indigo-500/30 transition-all group">
                            <div className="flex items-start justify-between mb-4">
                              <div>
                                <h5 className="font-black text-slate-900 dark:text-white text-sm transition-colors">{contact.name}</h5>
                                <p className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mt-0.5 transition-colors">{contact.position} • {contact.department}</p>
                              </div>
                              <div className="p-2 bg-white dark:bg-slate-800 rounded-lg text-slate-400">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                              </div>
                            </div>
                            <div className="space-y-2">
                              <div className="flex items-center text-[11px] text-slate-500 dark:text-slate-400 transition-colors">
                                <svg className="w-3.5 h-3.5 mr-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                {contact.email}
                              </div>
                              <div className="flex items-center text-[11px] text-slate-500 dark:text-slate-400 transition-colors">
                                <svg className="w-3.5 h-3.5 mr-2 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                {contact.phone}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-12 bg-slate-50 dark:bg-slate-900/20 border border-dashed border-slate-200 dark:border-white/5 rounded-[32px] flex flex-col items-center justify-center text-slate-400 dark:text-slate-600 transition-colors">
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Nenhum contato registrado</p>
                      </div>
                    )}
                  </section>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
