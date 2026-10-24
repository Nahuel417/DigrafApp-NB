import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

// Every probe is rolled back, including synthetic identities; no local accounts are reset.
const setup = `
begin;
insert into auth.users (id, email) values ('11111111-1111-4111-8111-111111111111', 'incidents-test@example.test');
insert into public.profiles (id, display_name, role, is_active, must_change_password)
values ('11111111-1111-4111-8111-111111111111', 'Incident test', 'admin', true, false);
insert into public.orders (id, client_name, team_name, phone, quantity, order_type, order_date, promised_delivery_date, current_stage_id, created_by, idempotency_key, idempotency_fingerprint)
select '22222222-2222-4222-8222-222222222222', 'Synthetic incident test', 'Test', '000', 1, 'individual', current_date, current_date, id,
'11111111-1111-4111-8111-111111111111', 'incident-test', md5('incident-test') from public.workflow_stages where code = 'received';
create function pg_temp.check(ok boolean) returns void language plpgsql as $$ begin
if ok is distinct from true then raise exception 'Incident assertion failed'; end if; end $$;
create function pg_temp.reject(statement text) returns void language plpgsql as $$ begin
begin execute statement; exception when others then return; end;
raise exception 'Expected rejection: %', statement; end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
`;
const order = "'22222222-2222-4222-8222-222222222222'";
const incident = "'33333333-3333-4333-8333-333333333333'";
function save(kind = "internal", reasons = "array['sewing']", version = 0, request = "44444444-4444-4444-8444-444444444444") {
  return `select public.save_order_incident(${order}, ${incident}, '${kind}', ${reasons}, ${version}, '${request}')`;
}
function reject(statement: string) { return `select pg_temp.reject($request$${statement}$request$);`; }
function probe(sql: string) {
  execFileSync("docker", ["exec", "-i", "supabase_db_DigrafApp-NB", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q"], {
    input: `${setup}\n${sql}\nrollback;`, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 20000,
  });
}

const psqlArgs = ["exec", "-i", "supabase_db_DigrafApp-NB", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-Atq"];
function localSql(sql: string) {
  return execFileSync("docker", psqlArgs, { input: sql, encoding: "utf8", timeout: 15000 }).trim();
}

function sqlSession(sql: string) {
  const child = spawn("docker", psqlArgs, { stdio: ["pipe", "pipe", "pipe"] });
  let output = "";
  let error = "";
  let signalReady: () => void;
  const ready = new Promise<void>((resolve) => { signalReady = resolve; });
  child.stdout.on("data", (chunk: Buffer) => {
    output += chunk.toString();
    if (output.includes("INCIDENT_SESSION_READY")) signalReady();
  });
  child.stderr.on("data", (chunk: Buffer) => { error += chunk.toString(); });
  const done = new Promise<{ code: number | null; error: string }>((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code) => { signalReady(); resolve({ code, error }); });
  });
  child.stdin.end(sql);
  return { ready, done, child };
}

describe("order incidents — simultaneous local sessions", () => {
  for (const scenario of ["create replay", "stale correction", "cancellation"] as const) {
    it(`serializes ${scenario} without duplicate or lost incident writes`, async () => {
      const actorId = randomUUID();
      const orderId = randomUUID();
      const incidentId = randomUUID();
      const requestId = randomUUID();
      const application = `incident-race-${randomUUID()}`;
      const fixture = setup.replaceAll("11111111-1111-4111-8111-111111111111", actorId)
        .replaceAll("22222222-2222-4222-8222-222222222222", orderId)
        .replaceAll("incidents-test@example.test", `${actorId}@example.test`).replaceAll("incident-test", actorId);
      const auth = `select set_config('request.jwt.claim.sub','${actorId}',true); select set_config('request.jwt.claim.role','authenticated',true); set local role authenticated;`;
      const write = (version: number, reason: string, key: string) => `select public.save_order_incident('${orderId}','${incidentId}','internal',array['${reason}'],${version},'${key}');`;
      const sessions: ReturnType<typeof sqlSession>[] = [];
      try {
        // Committed, unique synthetic fixtures are needed for cross-session visibility.
        localSql(`${fixture}\ncommit;`);
        if (scenario !== "create replay") localSql(`begin; ${auth} ${write(0, "sewing", randomUUID())} commit;`);
        const before = localSql(`select to_jsonb(i)::text from public.order_incidents i where id = '${incidentId}';`);
        const firstWrite = scenario === "cancellation"
          ? `reset role; update public.orders set lifecycle_state = 'cancelled', cancelled_at = clock_timestamp(), cancelled_by = '${actorId}', cancellation_reason = 'Synthetic race test' where id = '${orderId}';`
          : write(scenario === "create replay" ? 0 : 1, "design", requestId);
        const first = sqlSession(`begin; ${auth} ${firstWrite}\n\\echo INCIDENT_SESSION_READY\nselect pg_sleep(2); commit;`);
        sessions.push(first);
        await first.ready;
        const secondWrite = scenario === "create replay" ? write(0, "design", requestId)
          : scenario === "stale correction" ? write(1, "incomplete", randomUUID())
            : `select public.save_order_incident('${orderId}','${randomUUID()}','internal',array['sewing'],0,'${randomUUID()}');`;
        const second = sqlSession(`begin; set local application_name = '${application}'; ${auth}\n\\echo INCIDENT_SESSION_READY\n${secondWrite} commit;`);
        sessions.push(second);
        await second.ready;
        // Observe an actual blocked PostgreSQL session, not just elapsed wall time.
        expect(localSql(`select exists(select 1 from pg_stat_activity where application_name = '${application}' and wait_event_type = 'Lock');`)).toBe("t");
        const [winner, follower] = await Promise.all([first.done, second.done]);
        expect(winner.code, winner.error).toBe(0);
        if (scenario === "create replay") expect(follower.code, follower.error).toBe(0);
        else {
          expect(follower.code).not.toBe(0);
          expect(follower.error).toContain(scenario === "stale correction" ? "otra sesión" : "no está disponible");
        }
        const current = JSON.parse(localSql(`select json_build_object('version', i.version, 'reasons', i.reasons,
          'events', (select count(*) from public.order_incident_events e where e.incident_id = i.id)) from public.order_incidents i where i.id = '${incidentId}';`)) as { version: number; reasons: string[]; events: number };
        expect(current).toEqual(scenario === "stale correction" ? { version: 2, reasons: ["design"], events: 2 }
          : { version: 1, reasons: [scenario === "cancellation" ? "sewing" : "design"], events: 1 });
        if (scenario === "cancellation") expect(localSql(`select to_jsonb(i)::text from public.order_incidents i where id = '${incidentId}';`)).toBe(before);
      } finally {
        for (const session of sessions) session.child.kill();
        await Promise.allSettled(sessions.map((session) => session.done));
        localSql(`begin; set local lock_timeout = '5s';
          update public.orders set lifecycle_state = 'active', cancelled_at = null, cancelled_by = null, cancellation_reason = null where id = '${orderId}' and lifecycle_state = 'cancelled';
          delete from public.order_incident_events where incident_id in (select id from public.order_incidents where order_id = '${orderId}');
          delete from public.order_incidents where order_id = '${orderId}';
          delete from public.orders where id = '${orderId}';
          delete from public.profiles where id = '${actorId}'; delete from auth.users where id = '${actorId}'; commit;`);
        expect(localSql(`select exists(select 1 from auth.users where id = '${actorId}') or exists(select 1 from public.orders where id = '${orderId}');`)).toBe("f");
      }
    }, 20000);
  }
});

describe("order incidents — local database transaction probes", () => {
  it("records customer service issues and corrections with all five reasons without changing prior history", () => probe(`
    set local role authenticated;
    ${save("complaint_with_return", "array['customer_service']")};
    ${save("complaint_without_return", "array['sewing','design','incomplete','calendering','customer_service']", 1, "55555555-5555-4555-8555-555555555555")};
    select pg_temp.check((select version = 2 and cardinality(reasons) = 5 from public.order_incidents where id = ${incident}));
    select pg_temp.check((select reasons = array['customer_service'] from public.order_incident_events where incident_id = ${incident} and version = 1));
    select pg_temp.check((select count(*) = 2 from public.order_incident_events where incident_id = ${incident}));
    reset role;
    create temporary table before_rejected_reason as
      select md5(to_jsonb(i)::text) incident_hash,
        (select md5(jsonb_agg(to_jsonb(e) order by e.version)::text) from public.order_incident_events e where e.incident_id = i.id) events_hash
      from public.order_incidents i where i.id = ${incident};
    set local role authenticated;
    ${reject(save("complaint_without_return", "array['sewing','design','incomplete','calendering','customer_service','customer_service']", 2, "66666666-6666-4666-8666-666666666666"))}
    reset role;
    select pg_temp.check((select incident_hash = (select md5(to_jsonb(i)::text) from public.order_incidents i where i.id = ${incident})
      and events_hash = (select md5(jsonb_agg(to_jsonb(e) order by e.version)::text) from public.order_incident_events e where e.incident_id = ${incident}) from before_rejected_reason));
  `));
  it("normalizes reasons, replays once, and leaves both ledgers unchanged after rejected writes", () => probe(`
    set local role authenticated;
    ${save("internal", "array['sewing','sewing','design']")};
    ${save("internal", "array['design','sewing']")};
    select pg_temp.check((select reasons = array['design','sewing'] from public.order_incidents where id = ${incident}));
    select pg_temp.check((select count(*) = 1 from public.order_incident_events where incident_id = ${incident}));
    reset role;
    create temporary table before_reject as
      select to_jsonb(i) incident, (select jsonb_agg(to_jsonb(e) order by e.version) from public.order_incident_events e where e.incident_id = i.id) events
      from public.order_incidents i where i.id = ${incident};
    set local role authenticated;
    ${reject(save("complaint_with_return", "array['calendering']"))}
    ${reject(save("internal", "array['incomplete']", 0, "55555555-5555-4555-8555-555555555555"))}
    reset role;
    select pg_temp.check((select incident = (select to_jsonb(i) from public.order_incidents i where i.id = ${incident})
      and events = (select jsonb_agg(to_jsonb(e) order by e.version) from public.order_incident_events e where e.incident_id = ${incident}) from before_reject));
  `));

  it("retains complete incident and correction snapshots after purge without customer fields", () => probe(`
    set local role authenticated;
    ${save("complaint_with_return", "array['design','sewing']")};
    ${save("complaint_without_return", "array['incomplete']", 1, "55555555-5555-4555-8555-555555555555")};
    reset role;
    create temporary table incident_snapshots as
      select to_jsonb(i) incident, (select jsonb_agg(to_jsonb(e) order by e.version) from public.order_incident_events e where e.incident_id = i.id) events
      from public.order_incidents i where i.id = ${incident};
    update public.orders set lifecycle_state = 'cancelled', cancelled_at = now() - interval '31 days',
      cancelled_by = auth.uid(), cancellation_reason = 'Synthetic test' where id = ${order};
    set local role authenticated;
    select public.purge_cancelled_order(${order}, 'incidents-purge-test', 'Synthetic incident retention test');
    reset role;
    select pg_temp.check((select lifecycle_state = 'purged_cancelled' and customer_name is null and client_name is null and phone is null from public.orders where id = ${order}));
    select pg_temp.check((select incident = (select to_jsonb(i) from public.order_incidents i where i.id = ${incident})
      and events = (select jsonb_agg(to_jsonb(e) order by e.version) from public.order_incident_events e where e.incident_id = ${incident})
      and jsonb_array_length(events) = 2 from incident_snapshots));
    select pg_temp.check((select not (incident ?| array['customer_name','client_name','phone']) and events::text not like '%customer_name%' from incident_snapshots));
  `));

  it("creates multiple reasons, replays once, and preserves original and corrected values without changing the order", () => probe(`
    create temporary table before_order as select to_jsonb(o) value from public.orders o where id = ${order};
    set local role authenticated;
    ${save("complaint_with_return", "array['design','sewing']")};
    ${save("complaint_with_return", "array['sewing','design']")};
    ${save("complaint_without_return", "array['incomplete','calendering']", 1, "55555555-5555-4555-8555-555555555555")};
    select pg_temp.check((select version = 2 and kind = 'complaint_without_return' from public.order_incidents where id = ${incident}));
    select pg_temp.check((select count(*) = 2 from public.order_incident_events where incident_id = ${incident}));
    select pg_temp.check((select kind = 'complaint_with_return' and reasons = array['design','sewing'] and actor_id = auth.uid() from public.order_incident_events where incident_id = ${incident} and version = 1));
    reset role;
    select pg_temp.check((select value = to_jsonb(o) from public.orders o cross join before_order where id = ${order}));
  `));

  it("enforces every role, active profile, mandatory password change and anonymous denial", () => probe(`
    set local role authenticated;
    ${save()};
    reset role;
    update public.profiles set role = 'attention' where id = auth.uid();
    set local role authenticated;
    ${save("complaint_with_return", "array['design']", 1, "55555555-5555-4555-8555-555555555555")};
    reset role;
    update public.profiles set role = 'employee' where id = auth.uid();
    set local role authenticated;
    ${reject(save("complaint_with_return", "array['design']", 2))}
    ${reject(save("internal", "array['sewing']", 2))}
    select public.save_order_incident(${order}, gen_random_uuid(), 'internal', array['sewing'], 0, gen_random_uuid());
    ${reject(`select public.save_order_incident(${order}, gen_random_uuid(), 'complaint_without_return', array['sewing'], 0, gen_random_uuid())`)}
    reset role;
    update public.profiles set role = 'super_admin', is_active = false where id = auth.uid();
    set local role authenticated;
    ${reject(save())}
    select pg_temp.check((select count(*) = 0 from public.order_incidents where order_id = ${order}));
    reset role;
    update public.profiles set is_active = true, must_change_password = true where id = auth.uid();
    set local role authenticated;
    ${reject(save())}
    reset role;
    update public.profiles set must_change_password = false where id = auth.uid();
    set local role authenticated;
    select public.save_order_incident(${order}, gen_random_uuid(), 'internal', array['sewing'], 0, gen_random_uuid());
    set local role anon;
    ${reject(save())}
  `));

  it("rejects invalid input, stale corrections, conflicting replays and direct writes atomically", () => probe(`
    set local role authenticated;
    ${reject(save("unknown"))}
    ${reject(save("internal", "array[]::text[]"))}
    ${reject(save("internal", "array['unknown']"))}
    ${reject(save("internal", "array['sewing',null]"))}
    ${reject(save("internal", "null"))}
    ${save()};
    ${reject(save("complaint_with_return"))}
    ${reject(save("internal", "array['design']", 4, "55555555-5555-4555-8555-555555555555"))}
    ${reject(`update public.order_incidents set kind = 'complaint_with_return' where id = ${incident}`)}
    ${reject(`delete from public.order_incident_events where incident_id = ${incident}`)}
    ${reject(`insert into public.order_incidents (id, order_id, kind, reasons) values (gen_random_uuid(), ${order}, 'internal', array['sewing'])`)}
    select pg_temp.check((select version = 1 and kind = 'internal' from public.order_incidents where id = ${incident}));
    select pg_temp.check((select count(*) = 1 from public.order_incident_events where incident_id = ${incident}));
  `));

  it("allows archived orders without expanding employee access, and freezes but retains incidents after cancellation and purge", () => probe(`
    update public.orders set current_stage_id = (select id from public.workflow_stages where code = 'delivered'), lifecycle_state = 'archived_delivered' where id = ${order};
    set local role authenticated;
    ${save()};
    reset role;
    update public.profiles set role = 'employee' where id = auth.uid();
    set local role authenticated;
    ${reject(save("internal", "array['design']", 1, "55555555-5555-4555-8555-555555555555"))}
    select pg_temp.check((select count(*) = 0 from public.order_incidents where order_id = ${order}));
    reset role;
    update public.profiles set role = 'admin' where id = auth.uid();
    update public.orders set lifecycle_state = 'cancelled', cancelled_at = now() - interval '31 days', cancelled_by = auth.uid(), cancellation_reason = 'Synthetic test' where id = ${order};
    set local role authenticated;
    ${reject(save("internal", "array['design']", 1, "55555555-5555-4555-8555-555555555555"))}
    ${reject(`select public.save_order_incident(${order}, gen_random_uuid(), 'internal', array['sewing'], 0, gen_random_uuid())`)}
    select public.purge_cancelled_order(${order}, 'incidents-purge-test', 'Synthetic incident retention test');
    reset role;
    select pg_temp.check((select lifecycle_state = 'purged_cancelled' from public.orders where id = ${order}));
    select pg_temp.check((select count(*) = 1 from public.order_incidents where order_id = ${order}));
    select pg_temp.check((select count(*) = 1 from public.order_incident_events where incident_id = ${incident}));
    set local role authenticated;
    ${reject(save("internal", "array['design']", 1, "55555555-5555-4555-8555-555555555555"))}
  `));
});
