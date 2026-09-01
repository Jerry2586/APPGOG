import { COMPONENT_REGISTRY, COMPONENT_SCHEMA_VERSION, ComponentPropsValidationError, validateComponentProps } from './component-registry';

describe('component registry', () => {
  it('contains 18 unique versioned component contracts', () => {
    expect(COMPONENT_SCHEMA_VERSION).toBe(1);
    expect(COMPONENT_REGISTRY).toHaveLength(18);
    expect(new Set(COMPONENT_REGISTRY.map(item => item.type)).size).toBe(18);
    expect(COMPONENT_REGISTRY.map(item => item.type)).toContain('breadcrumb');
  });

  it('accepts every registered default props object', () => {
    for (const component of COMPONENT_REGISTRY) {
      expect(() => validateComponentProps(component.type, component.defaults)).not.toThrow();
    }
  });

  it('rejects undeclared props, bad enums and out-of-range numbers', () => {
    expect(() => validateComponentProps('hero', { executable: '<script />' })).toThrow(ComponentPropsValidationError);
    expect(() => validateComponentProps('button', { variant: 'danger' })).toThrow('variant不在允许选项内');
    expect(() => validateComponentProps('carousel', { intervalMs: 500 })).toThrow('intervalMs数值超出允许范围');
  });

  it('rejects unsafe nested URLs', () => {
    expect(() => validateComponentProps('carousel', {
      slides: [{ imageUrl: 'javascript:alert(1)', title: 'bad' }]
    })).toThrow('slides[0].imageUrl必须是无身份信息和参数的 HTTP/HTTPS URL');
  });
  it('allows marketing data binding but rejects backslash and control-character URL escapes', () => {
    expect(() => validateComponentProps('popup', { campaignId: 'campaign-1', timezone: 'Asia/Shanghai' })).not.toThrow();
    for (const url of ['/\\evil.invalid', '/\n/evil.invalid']) expect(() => validateComponentProps('sale', { url })).toThrow(ComponentPropsValidationError);
  });
});
