export interface FieldConfig {
  label: string;
  format?: (val: any) => string;
}

export const generateDiffLogs = (
  oldObj: any, 
  newObj: any, 
  config: Record<string, FieldConfig>, 
  subjectName: string
): string[] => {
  const changes: string[] = [];
  
  if (!oldObj || !newObj) return changes;

  Object.keys(config).forEach(key => {
    let oldVal = oldObj[key];
    let newVal = newObj[key];

    if (oldVal !== newVal) {
      // Tratar falsy values equivalentes (ex: undefined para '')
      if (!oldVal && !newVal && typeof oldVal !== 'boolean' && typeof newVal !== 'boolean') return;
      
      const fieldConfig = config[key];
      const formattedOld = fieldConfig.format ? fieldConfig.format(oldVal) : (oldVal || 'Vazio');
      const formattedNew = fieldConfig.format ? fieldConfig.format(newVal) : (newVal || 'Vazio');

      // Se após a formatação ficar igual, não é mudança real (ex: datas incompletas)
      if (formattedOld !== formattedNew) {
        changes.push(`atualizou ${subjectName} (${fieldConfig.label}: de "${formattedOld}" para "${formattedNew}")`);
      }
    }
  });

  return changes;
};

export const formatDateForLog = (dateStr: any) => {
  if (!dateStr) return 'Vazio';
  const parts = String(dateStr).split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
};

export const formatBooleanForLog = (val: any) => val ? 'Ativo' : 'Inativo';
