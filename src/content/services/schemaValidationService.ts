/**
 * Schema Validation Service
 * Service for generating TypeScript schemas from JSON responses and validating API consistency
 */

// Type definitions
type PrimitiveType = 'string' | 'number' | 'boolean' | 'null' | 'undefined';
type ComplexType = 'object' | 'array' | 'union';
type SchemaType = PrimitiveType | ComplexType;

interface SchemaNode {
  type: SchemaType;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  types?: PrimitiveType[];
  optional?: boolean;
}

interface ValidationError {
  path: string;
  expected: string;
  actual: string;
  value: any;
}

interface ValidationWarning {
  path: string;
  message: string;
  value: any;
}

interface ValidationResult {
  isValid: boolean;
  hasWarnings: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  summary: {
    errorCount: number;
    warningCount: number;
  };
  errorMessages?: string[];
  warningMessages?: string[];
}

interface SchemaGenerationOptions {
  format?: 'multiline' | 'inline';
}

interface SchemaComparison {
  isCompatible: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  originalSchema: SchemaNode;
  newSchema: SchemaNode;
}

class SchemaValidationService {
  private schemaCache: Map<string, SchemaNode>;

  constructor() {
    this.schemaCache = new Map();
  }

  /**
   * Generate TypeScript type definition from JSON response
   * @param responseBody - JSON response body (string or object)
   * @param typeName - Name for the generated type
   * @param options - Generation options (format: 'multiline' | 'inline')
   * @returns TypeScript type definition as string
   */
  public generateTypeDefinition(
    responseBody: any,
    typeName: string,
    options: SchemaGenerationOptions = {}
  ): string {
    try {
      const data = this.parseResponseBody(responseBody);
      const schema = this.generateSchema(data);
      
      // Cache the schema for future validations
      this.schemaCache.set(typeName, schema);
      
      const format = options.format || 'multiline';
      const typeDefinition = format === 'inline' 
        ? this.schemaToTypeScriptInline(schema)
        : this.schemaToTypeScript(schema);
      
      return `type ${typeName} = ${typeDefinition};`;
    } catch (error: any) {
      throw new Error(`Failed to generate type definition: ${error.message}`);
    }
  }

  /**
   * Validate response against existing schema
   * @param newResponseBody - New response to validate
   * @param originalResponseBody - Original response to compare against
   * @returns Validation result with errors and warnings
   */
  public validateResponse(
    newResponseBody: any,
    originalResponseBody: any
  ): ValidationResult {
    try {
      const newData = this.parseResponseBody(newResponseBody);
      const originalData = this.parseResponseBody(originalResponseBody);
      
      const originalSchema = this.generateSchema(originalData);
      return this.performValidation(newData, originalSchema);
    } catch (error: any) {
      return {
        isValid: false,
        hasWarnings: false,
        errors: [{
          path: 'root',
          expected: 'valid JSON',
          actual: 'error',
          value: error.message
        }],
        warnings: [],
        summary: {
          errorCount: 1,
          warningCount: 0
        }
      };
    }
  }

  /**
   * Validate response against cached schema
   * @param responseBody - Response to validate
   * @param schemaName - Name of cached schema
   * @returns Validation result
   */
  public validateAgainstCachedSchema(
    responseBody: any,
    schemaName: string
  ): ValidationResult {
    const cachedSchema = this.schemaCache.get(schemaName);
    if (!cachedSchema) {
      throw new Error(`No cached schema found for: ${schemaName}`);
    }

    const data = this.parseResponseBody(responseBody);
    return this.performValidation(data, cachedSchema);
  }

  /**
   * Compare two schemas for compatibility
   * @param response1 - First response
   * @param response2 - Second response
   * @returns Comparison result
   */
  public compareSchemas(response1: any, response2: any): SchemaComparison {
    const data1 = this.parseResponseBody(response1);
    const data2 = this.parseResponseBody(response2);
    
    const schema1 = this.generateSchema(data1);
    const schema2 = this.generateSchema(data2);
    
    const validation = this.validateAgainstSchema(data2, schema1);
    
    return {
      isCompatible: validation.errors.length === 0,
      errors: validation.errors,
      warnings: validation.warnings,
      originalSchema: schema1,
      newSchema: schema2
    };
  }

  /**
   * Get cached schema
   * @param schemaName - Name of schema to retrieve
   * @returns Cached schema or undefined
   */
  public getCachedSchema(schemaName: string): SchemaNode | undefined {
    return this.schemaCache.get(schemaName);
  }

  /**
   * Clear schema cache
   */
  public clearCache(): void {
    this.schemaCache.clear();
  }

  /**
   * Get all cached schema names
   * @returns Array of cached schema names
   */
  public getCachedSchemaNames(): string[] {
    return Array.from(this.schemaCache.keys());
  }

  // Private helper methods

  private parseResponseBody(responseBody: any): any {
    if (typeof responseBody === 'string') {
      return JSON.parse(responseBody);
    }
    return responseBody;
  }

  private getType(value: any): SchemaType {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (Array.isArray(value)) return 'array';
    return typeof value as SchemaType;
  }

  private generateSchema(value: any): SchemaNode {
    const type = this.getType(value);
    const schema: SchemaNode = { type };

    if (type === 'object' && value !== null) {
      schema.properties = {};
      for (const [key, val] of Object.entries(value)) {
        schema.properties[key] = this.generateSchema(val);
      }
    } else if (type === 'array' && Array.isArray(value)) {
      if (value.length > 0) {
        let itemSchema = this.generateSchema(value[0]);
        for (let i = 1; i < value.length; i++) {
          itemSchema = this.mergeSchemaNodes(itemSchema, this.generateSchema(value[i]));
        }
        schema.items = itemSchema;
      } else {
        schema.items = { type: 'object', properties: {} };
      }
    }

    return schema;
  }

  private mergeSchemaNodes(node1: SchemaNode, node2: SchemaNode): SchemaNode {
    // Handle null values by treating them as optional
    if (node1.type === 'null' && node2.type !== 'null') {
      return { ...node2, optional: true };
    }
    if (node2.type === 'null' && node1.type !== 'null') {
      return { ...node1, optional: true };
    }
    
    // Handle type mismatches
    if (node1.type !== node2.type) {
      if (node1.type === 'undefined') return node2;
      if (node2.type === 'undefined') return node1;
      
      // Create union type
      return {
        type: 'union',
        types: [node1.type as PrimitiveType, node2.type as PrimitiveType],
        optional: node1.optional || node2.optional
      };
    }

    const merged: SchemaNode = { type: node1.type };
    
    // Preserve optional flag
    if (node1.optional || node2.optional) {
      merged.optional = true;
    }

    // Merge object properties
    if (node1.type === 'object' && node1.properties && node2.properties) {
      merged.properties = {};
      const allKeys = new Set([
        ...Object.keys(node1.properties),
        ...Object.keys(node2.properties)
      ]);

      for (const key of allKeys) {
        if (node1.properties[key] && node2.properties[key]) {
          merged.properties[key] = this.mergeSchemaNodes(
            node1.properties[key],
            node2.properties[key]
          );
        } else if (node1.properties[key]) {
          merged.properties[key] = { ...node1.properties[key], optional: true };
        } else if (node2.properties[key]) {
          merged.properties[key] = { ...node2.properties[key], optional: true };
        }
      }
    } else if (node1.properties) {
      merged.properties = node1.properties;
    } else if (node2.properties) {
      merged.properties = node2.properties;
    }

    // Merge array items
    if (node1.type === 'array' && node1.items && node2.items) {
      merged.items = this.mergeSchemaNodes(node1.items, node2.items);
    } else if (node1.items) {
      merged.items = node1.items;
    } else if (node2.items) {
      merged.items = node2.items;
    }

    return merged;
  }

  private schemaToTypeScript(schema: SchemaNode, indent: number = 0): string {
    const spaces = ' '.repeat(indent);
    
    if (schema.type === 'union' && schema.types) {
      const types = schema.types.map(t => this.primitiveToTypeScript(t));
      return types.join(' | ');
    }
    
    switch (schema.type) {
      case 'string':
      case 'number':
      case 'boolean':
      case 'null':
      case 'undefined':
        return this.primitiveToTypeScript(schema.type);
      
      case 'array':
        if (schema.items) {
          return `${this.schemaToTypeScript(schema.items, indent)}[]`;
        }
        return 'any[]';
      
      case 'object':
        if (!schema.properties || Object.keys(schema.properties).length === 0) {
          return '{}';
        }
        
        const props = Object.entries(schema.properties)
          .map(([key, value]) => {
            const optional = value.optional ? '?' : '';
            const propType = this.schemaToTypeScript(value, indent + 2);
            const finalType = value.optional && value.type !== 'null' && value.type !== 'union' 
              ? `${propType} | null` 
              : propType;
            return `${spaces}  ${key}${optional}: ${finalType};`;
          })
          .join('\n');
        
        return `{\n${props}\n${spaces}}`;
      
      default:
        return 'any';
    }
  }

  private schemaToTypeScriptInline(schema: SchemaNode): string {
    if (schema.type === 'union' && schema.types) {
      const types = schema.types.map(t => this.primitiveToTypeScript(t));
      return types.join(' | ');
    }
    
    switch (schema.type) {
      case 'string':
      case 'number':
      case 'boolean':
      case 'null':
      case 'undefined':
        return this.primitiveToTypeScript(schema.type);
      
      case 'array':
        if (schema.items) {
          return `${this.schemaToTypeScriptInline(schema.items)}[]`;
        }
        return 'any[]';
      
      case 'object':
        if (!schema.properties || Object.keys(schema.properties).length === 0) {
          return '{}';
        }
        
        const props = Object.entries(schema.properties)
          .map(([key, value]) => {
            const optional = value.optional ? '?' : '';
            const propType = this.schemaToTypeScriptInline(value);
            const finalType = value.optional && value.type !== 'null' && value.type !== 'union' 
              ? `${propType} | null` 
              : propType;
            return `${key}${optional}: ${finalType}`;
          })
          .join('; ');
        
        return `{ ${props} }`;
      
      default:
        return 'any';
    }
  }

  private primitiveToTypeScript(type: PrimitiveType): string {
    return type;
  }

  private performValidation(data: any, schema: SchemaNode): ValidationResult {
    const validation = this.validateAgainstSchema(data, schema);
    
    const result: ValidationResult = {
      isValid: validation.errors.length === 0,
      hasWarnings: validation.warnings.length > 0,
      errors: validation.errors,
      warnings: validation.warnings,
      summary: {
        errorCount: validation.errors.length,
        warningCount: validation.warnings.length
      }
    };
    
    if (validation.errors.length > 0) {
      result.errorMessages = validation.errors.map(err => 
        `Error at ${err.path}: expected ${err.expected}, got ${err.actual}`
      );
    }
    
    if (validation.warnings.length > 0) {
      result.warningMessages = validation.warnings.map(warn => 
        `Warning at ${warn.path}: ${warn.message}`
      );
    }
    
    return result;
  }

  private validateAgainstSchema(
    data: any, 
    schema: SchemaNode, 
    path: string = ''
  ): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    
    const dataType = this.getType(data);
    
    // Check union types
    if (schema.type === 'union' && schema.types) {
      if (!schema.types.includes(dataType as PrimitiveType)) {
        errors.push({
          path,
          expected: schema.types.join(' | '),
          actual: dataType,
          value: data
        });
      }
      return { errors, warnings };
    }
    
    // Handle null values for optional fields
    if (dataType === 'null' && schema.optional) {
      return { errors, warnings };
    }
    
    // Type mismatch
    if (dataType !== schema.type && !(dataType === 'null' && schema.optional)) {
      errors.push({
        path,
        expected: schema.optional ? `${schema.type} | null` : schema.type,
        actual: dataType,
        value: data
      });
      return { errors, warnings };
    }
    
    // Validate object properties
    if (schema.type === 'object' && schema.properties) {
      const dataKeys = new Set(Object.keys(data || {}));
      const schemaKeys = new Set(Object.keys(schema.properties));
      
      // Check for missing required fields
      for (const key of schemaKeys) {
        const fieldSchema = schema.properties[key];
        if (!fieldSchema.optional && !dataKeys.has(key)) {
          errors.push({
            path: path ? `${path}.${key}` : key,
            expected: fieldSchema.type,
            actual: 'missing',
            value: undefined
          });
        }
      }
      
      // Check for extra fields
      for (const key of dataKeys) {
        if (!schemaKeys.has(key)) {
          warnings.push({
            path: path ? `${path}.${key}` : key,
            message: 'Extra field not in schema',
            value: data[key]
          });
        }
      }
      
      // Validate each property
      for (const key of dataKeys) {
        if (schema.properties[key]) {
          const fieldPath = path ? `${path}.${key}` : key;
          const result = this.validateAgainstSchema(
            data[key], 
            schema.properties[key], 
            fieldPath
          );
          errors.push(...result.errors);
          warnings.push(...result.warnings);
        }
      }
    }
    
    // Validate array items
    if (schema.type === 'array' && schema.items && Array.isArray(data)) {
      data.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        const result = this.validateAgainstSchema(item, schema.items!, itemPath);
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      });
    }
    
    return { errors, warnings };
  }
}

// Export for use in browser extension
export default SchemaValidationService;

// For direct browser usage (without module system)
if (typeof window !== 'undefined') {
  (window as any).SchemaValidationService = SchemaValidationService;
}