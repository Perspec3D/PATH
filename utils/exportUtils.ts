import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { Client, Project, InternalUser } from '../types';

export const exportProjectsToExcel = (projects: Project[], clients: Client[], users: InternalUser[]) => {
    const data = projects.map(p => {
        const client = clients.find(c => c.id === p.clientId);
        const assignee = users.find(u => u.id === p.assigneeId);

        return {
            'Código': p.code,
            'Projeto': p.name,
            'Cliente': client ? client.name : 'N/A',
            'Responsável': assignee ? assignee.username : 'N/A',
            'Revisão': p.revision,
            'Status': p.status,
            'Início': p.startDate ? new Date(p.startDate).toLocaleDateString('pt-BR') : '',
            'Entrega': p.deliveryDate ? new Date(p.deliveryDate).toLocaleDateString('pt-BR') : '',
            'Prazo Final': p.dueDate ? new Date(p.dueDate).toLocaleDateString('pt-BR') : '',
            'Subtarefas': p.subtasks.length,
            'Progresso (%)': p.subtasks && p.subtasks.length > 0
                ? Math.round((p.subtasks.filter(s => s.status === 'Concluído').length / p.subtasks.length) * 100)
                : 0
        };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Projetos');
    XLSX.writeFile(wb, `Projetos_PATH_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const exportClientsToExcel = (clients: Client[]) => {
    const data = clients.map(c => ({
        'Código': c.code,
        'Nome/Razão Social': c.name,
        'Tipo': c.type,
        'Status': c.status,
        'CPF/CNPJ': c.cpfCnpj,
        'E-mail': c.email,
        'Telefone': c.phone,
        'CEP': c.zipCode,
        'Cidade': c.city,
        'Estado': c.state,
        'Endereço': `${c.address}, ${c.number}`,
        'Bairro': c.neighborhood,
        'Contatos': c.contacts.length
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes');
    XLSX.writeFile(wb, `Clientes_PATH_${new Date().toISOString().split('T')[0]}.xlsx`);
};

export const exportDashboardToPDF = async (elementId: string) => {
    const element = document.getElementById(elementId);
    if (!element) {
        console.error('Elemento do Dashboard não encontrado');
        return;
    }

    try {
        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: window.getComputedStyle(element).backgroundColor
        });

        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF('l', 'mm', 'a4');
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();

        const imgProps = pdf.getImageProperties(imgData);
        const ratio = Math.min(pdfWidth / imgProps.width, pdfHeight / imgProps.height);
        const width = imgProps.width * ratio;
        const height = imgProps.height * ratio;

        const x = (pdfWidth - width) / 2;
        const y = (pdfHeight - height) / 2;

        pdf.addImage(imgData, 'PNG', x, y, width, height);
        pdf.save(`Dashboard_PATH_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
        console.error('Erro ao gerar PDF:', err);
    }
};
