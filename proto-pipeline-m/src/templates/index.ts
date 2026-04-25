import { TemplateModuleSchema, type TemplateModule } from "../schemas/template.ts";
import artilleryDragShoot from "./artillery_drag_shoot.ts";

const REGISTRY: Record<string, TemplateModule> = {
  [artilleryDragShoot.id]: TemplateModuleSchema.parse(artilleryDragShoot),
};

export function getTemplate(templateId: string | null | undefined): TemplateModule | null {
  if (!templateId) return null;
  return REGISTRY[templateId] ?? null;
}

export function listTemplateIds(): string[] {
  return Object.keys(REGISTRY);
}
