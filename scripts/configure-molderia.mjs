import assert from "node:assert/strict";

const usage = `Moldería stage provisioning (prints SQL only; never connects to a database)

Local: Supabase local seed appends Moldería without reordering existing stages.
Staging create: node scripts/configure-molderia.mjs --environment=staging --create-stage --actor-id=<admin-profile-uuid> --confirm-target=staging
Staging bind existing: node scripts/configure-molderia.mjs --environment=staging --stage-id=<reviewed-stage-uuid> --confirm-target=staging
Production bind only: node scripts/configure-molderia.mjs --environment=production --stage-id=<reviewed-stage-uuid> --confirm-target=production
Self-check: node scripts/configure-molderia.mjs --self-check

Staging creation uses the audited stage RPC to append the stage without reordering existing stages. Production creation is never allowed; bind only a reviewed existing stage ID.`;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseOptions(args) {
  return Object.fromEntries(args.map((argument) => {
    const separator = argument.indexOf("=");
    return separator === -1 ? [argument, ""] : [argument.slice(0, separator), argument.slice(separator + 1)];
  }));
}

function bindingSql(environment, stageId) {
  return `-- Reviewed ${environment} stage ID; this script prints SQL only and does not connect to a database.
begin;
do $molderia$
declare affected_rows integer;
begin
  update public.workflow_stages
  set requires_design_image = true, updated_at = now()
   where id = '${stageId}'::uuid
     and lower(btrim(name)) in ('moldería', 'molderia')
     and is_active;
  get diagnostics affected_rows = row_count;
  if affected_rows <> 1 then
     raise exception 'The reviewed stage ID must identify the active Moldería stage.';
  end if;
end
$molderia$;
commit;`;
}

function stagingCreateSql(actorId) {
  return `-- Explicit staging-only creation; this script prints SQL only and does not connect to a database.
begin;
do $molderia$
declare
  requested_actor_id uuid := '${actorId}'::uuid;
  actor public.profiles%rowtype;
  molderia_stage_id uuid;
begin
  select * into actor
  from public.profiles
  where id = requested_actor_id
  for update;
  if not found or not actor.is_active or actor.must_change_password or actor.role not in ('super_admin', 'admin') then
    raise exception 'The reviewed actor must be an active stage administrator.';
  end if;

  perform set_config('request.jwt.claim.sub', actor.id::text, true);
  perform set_config('request.jwt.claim.role', 'authenticated', true);
  lock table public.workflow_stages in share row exclusive mode;

  if exists (select 1 from public.workflow_stages where requires_design_image)
    or exists (select 1 from public.workflow_stages where lower(btrim(name)) in ('moldería', 'molderia')) then
    raise exception 'A Moldería stage or image-requiring stage already exists; review and bind its ID instead of creating a duplicate.';
  end if;

  select stage_id into molderia_stage_id
  from public.create_workflow_stage('Moldería', 'gentle-molderia-staging-create-v1');
  if molderia_stage_id is null then
    raise exception 'The stage creation RPC returned no stage.';
  end if;

  update public.workflow_stages
  set requires_design_image = true, updated_at = now()
  where id = molderia_stage_id;

end
$molderia$;
commit;`;
}

function renderSql(options) {
  const allowedOptions = new Set(['--environment', '--stage-id', '--actor-id', '--confirm-target', '--create-stage']);
  if (Object.keys(options).some((option) => !allowedOptions.has(option))) {
    throw new Error('Unknown provisioning option.');
  }
  const { "--environment": environment, "--stage-id": stageId, "--actor-id": actorId, "--confirm-target": confirmation } = options;
  const createStage = Object.hasOwn(options, "--create-stage");
  if (!new Set(["staging", "production"]).has(environment) || confirmation !== environment) {
    throw new Error("Choose staging or production explicitly and confirm the same target.");
  }
  if (createStage) {
    if (Object.hasOwn(options, '--stage-id') || options['--create-stage'] !== '') throw new Error('Stage creation does not accept a stage ID or flag value.');
    if (environment !== "staging") throw new Error("Stage creation is allowed only for staging; production is bind-only.");
    if (!uuidPattern.test(actorId ?? "")) throw new Error("Stage creation requires a reviewed admin profile UUID.");
    return stagingCreateSql(actorId);
  }
  if (Object.hasOwn(options, '--actor-id')) throw new Error('Binding does not accept an actor ID.');
  if (!uuidPattern.test(stageId ?? "")) throw new Error("Binding requires a reviewed existing stage UUID.");
  return bindingSql(environment, stageId);
}

function selfCheck() {
  const bindingOptions = {
    '--environment': 'production',
    '--stage-id': '11111111-1111-4111-8111-111111111111',
    '--confirm-target': 'production',
  };
  assert.throws(() => renderSql({ ...bindingOptions, '--create-stgae': '' }), /Unknown provisioning option/);
  assert.match(renderSql(bindingOptions), /lower\(btrim\(name\)\) in \('moldería', 'molderia'\)/);
  assert.match(renderSql(bindingOptions), /and is_active/);
  const createSql = stagingCreateSql("11111111-1111-4111-8111-111111111111");
  assert.match(createSql, /public\.create_workflow_stage\('Moldería'/);
  assert.doesNotMatch(createSql, /public\.reorder_workflow_stages\(/);
  assert.doesNotMatch(createSql, /design_index|cut_index|code = 'design'|code = 'cut'/);
  assert.match(createSql, /requires_design_image = true/);
  assert.throws(() => renderSql({
    "--environment": "production",
    "--create-stage": "",
    "--actor-id": "11111111-1111-4111-8111-111111111111",
    "--confirm-target": "production",
  }), /production is bind-only/);
  console.log("Moldería provisioning SQL self-check passed.");
}

const options = parseOptions(process.argv.slice(2));
if (Object.hasOwn(options, "--help") || process.argv.length === 2) {
  console.log(usage);
} else if (Object.hasOwn(options, "--self-check")) {
  selfCheck();
} else {
  try {
    console.log(renderSql(options));
  } catch (error) {
    console.error(`${error.message}\n\n${usage}`);
    process.exitCode = 1;
  }
}
