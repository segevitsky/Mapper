export const MappingsList: React.FC<{
    mappings: any[];
    onRemoveMapping: (id: string) => void;
  }> = ({ mappings, onRemoveMapping }) => {
    return (
      <div>
        {mappings.map(mapping => (
          <div key={mapping.id}>
            {mapping.elementSelector} - {mapping.apiEndpoint}
            <button onClick={() => onRemoveMapping(mapping.id)}>Remove</button>
          </div>
        ))}
      </div>
    );
  };