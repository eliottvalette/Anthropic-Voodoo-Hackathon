import { z } from "zod";

export const SCENE_ELEMENT_NAMES = [
  "bg_ground",
  "actors",
  "projectiles",
  "hud",
  "end_card",
] as const;

export const SceneElementNameSchema = z.enum(SCENE_ELEMENT_NAMES);
export type SceneElementName = z.infer<typeof SceneElementNameSchema>;

export const CANONICAL_PHASES = [
  "idle",
  "aiming",
  "acting",
  "resolving",
  "win",
  "loss",
] as const;
export type CanonicalPhase = (typeof CANONICAL_PHASES)[number];

export const RESERVED_STATE_FIELDS = [
  "phase",
  "subPhase",
  "turnIndex",
  "isOver",
] as const;

export const StateFieldSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
    initial: z.unknown(),
    description: z.string(),
    written_by: z.array(SceneElementNameSchema),
    read_by: z.array(SceneElementNameSchema),
  })
  .strict();
export type StateField = z.infer<typeof StateFieldSchema>;

export const ElementContractSchema = z
  .object({
    responsibility_one_sentence: z.string().min(1),
    draws: z.array(z.string()).min(1),
    uses_assets: z.array(z.string()),
    reads: z.array(z.string()),
    writes: z.array(z.string()),
    events_emitted: z.array(z.string()),
    events_consumed: z.array(z.string()),
    notes: z.string().optional(),
  })
  .strict();
export type ElementContract = z.infer<typeof ElementContractSchema>;

export const PhaseTransitionSchema = z
  .object({
    from: z.string(),
    to: z.string(),
    condition: z.string(),
  })
  .strict();
export type PhaseTransition = z.infer<typeof PhaseTransitionSchema>;

export const P4PlanSchema = z
  .object({
    mechanic_name: z.string().min(1),
    viewport: z.object({ width: z.number(), height: z.number() }).strict(),
    tick_order: z.array(SceneElementNameSchema),
    shared_state_shape: z.array(StateFieldSchema).min(4).max(20),
    numeric_params: z.record(z.union([z.number(), z.string(), z.boolean()])),
    phases: z.array(z.string()).min(2),
    transitions: z.array(PhaseTransitionSchema).min(1),
    scene_elements: z
      .object({
        bg_ground: ElementContractSchema,
        actors: ElementContractSchema,
        projectiles: ElementContractSchema,
        hud: ElementContractSchema,
        end_card: ElementContractSchema,
      })
      .strict(),
    open_questions: z.array(z.string()),
  })
  .strict()
  .superRefine((v, ctx) => {
    const stateNames = new Set(v.shared_state_shape.map((f) => f.name));
    const elements = v.scene_elements;
    const elementNames: SceneElementName[] = [
      "bg_ground",
      "actors",
      "projectiles",
      "hud",
      "end_card",
    ];
    for (const el of elementNames) {
      const c = elements[el];
      for (const r of c.reads) {
        if (!stateNames.has(r)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["scene_elements", el, "reads"],
            message: `${el}.reads references unknown state field "${r}"`,
          });
        }
      }
      for (const w of c.writes) {
        if (!stateNames.has(w)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["scene_elements", el, "writes"],
            message: `${el}.writes references unknown state field "${w}"`,
          });
        }
      }
    }

    for (const f of v.shared_state_shape) {
      const declaredWriters = new Set(f.written_by);
      const declaredReaders = new Set(f.read_by);
      for (const el of elementNames) {
        const c = elements[el];
        if (c.writes.includes(f.name) && !declaredWriters.has(el)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shared_state_shape"],
            message: `state.${f.name}.written_by missing "${el}" but ${el}.writes includes it`,
          });
        }
        if (c.reads.includes(f.name) && !declaredReaders.has(el)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["shared_state_shape"],
            message: `state.${f.name}.read_by missing "${el}" but ${el}.reads includes it`,
          });
        }
      }
    }

    const expected = CANONICAL_PHASES.join(",");
    const actual = v.phases.join(",");
    if (actual !== expected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["phases"],
        message: `phases must equal canonical enum exactly: ["${CANONICAL_PHASES.join('","')}"] (got [${v.phases.map((p) => `"${p}"`).join(",")}])`,
      });
    }
    const phaseSet = new Set<string>(CANONICAL_PHASES);
    for (let i = 0; i < v.transitions.length; i++) {
      const t = v.transitions[i]!;
      if (!phaseSet.has(t.from)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transitions", i, "from"],
          message: `transitions[${i}].from "${t.from}" not in canonical phases`,
        });
      }
      if (!phaseSet.has(t.to)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["transitions", i, "to"],
          message: `transitions[${i}].to "${t.to}" not in canonical phases`,
        });
      }
    }
    const stateNamesAll = new Set(v.shared_state_shape.map((f) => f.name));
    for (const reserved of RESERVED_STATE_FIELDS) {
      if (!stateNamesAll.has(reserved)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["shared_state_shape"],
          message: `shared_state_shape must contain reserved field "${reserved}"`,
        });
      }
    }
    const phaseField = v.shared_state_shape.find((f) => f.name === "phase");
    if (phaseField && !phaseField.written_by.includes("actors")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shared_state_shape"],
        message: `state.phase must be written_by ["actors"] (only actors owns phase transitions)`,
      });
    }
  });

export type P4Plan = z.infer<typeof P4PlanSchema>;
