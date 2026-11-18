import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { createTestDb, SEED_GROUP_ID } from "../helpers/pg";

let db: PGlite;
let playerA: string;
let playerB: string;

const url = "https://tikkie.me/pay/8r15at1oa456fh4464ep";

const insertRequest = (cols = "", vals = "") =>
  db.query<{ id: string }>(
    `insert into payment_requests (group_id, title, amount_cents, payment_url${cols})
     values ('${SEED_GROUP_ID}', 'Sportcomplex Olympia', 250, '${url}'${vals}) returning id`,
  );

beforeAll(async () => {
  db = await createTestDb({ seed: true });
  const { rows } = await db.query<{ id: string }>("select id from players order by name limit 2");
  [playerA, playerB] = rows.map((r) => r.id);
});
afterAll(async () => db.close());

describe("payment_requests", () => {
  it("accepts a normal request", async () => {
    const { rows } = await insertRequest(", expires_on", ", '2026-12-02'");
    expect(rows[0].id).toBeTruthy();
  });

  it.each([
    ["an amount below 10 cents", "5", url, "Pitch"],
    ["an amount over 1000 euros", "100001", url, "Pitch"],
    ["a zero amount", "0", url, "Pitch"],
    ["a plain http link", "250", "http://tikkie.me/pay/abc", "Pitch"],
    ["a javascript link", "250", "javascript:alert(1)", "Pitch"],
    ["a link with a space", "250", "https://tikkie.me/pay/a b", "Pitch"],
    ["a blank title", "250", url, "   "],
  ])("refuses %s", async (_label, cents, link, title) => {
    await expect(
      db.exec(
        `insert into payment_requests (group_id, title, amount_cents, payment_url)
         values ('${SEED_GROUP_ID}', '${title}', ${cents}, '${link}')`,
      ),
    ).rejects.toThrow();
  });
});

describe("payment_shares", () => {
  it("allows one share per player per request", async () => {
    const { rows } = await insertRequest();
    const ins = `insert into payment_shares (request_id, player_id) values ('${rows[0].id}', '${playerA}')`;
    await db.exec(ins);
    await expect(db.exec(ins)).rejects.toThrow();
  });

  it("starts as requested", async () => {
    const { rows } = await insertRequest();
    await db.exec(`insert into payment_shares (request_id, player_id) values ('${rows[0].id}', '${playerB}')`);
    const share = await db.query<{ status: string; paid_at: string | null }>(
      `select status::text, paid_at from payment_shares where request_id = '${rows[0].id}'`,
    );
    expect(share.rows[0]).toEqual({ status: "requested", paid_at: null });
  });

  it("gives a paid share a time, and nothing else one", async () => {
    const { rows } = await insertRequest();
    const id = rows[0].id;
    await expect(
      db.exec(`insert into payment_shares (request_id, player_id, status) values ('${id}', '${playerA}', 'paid')`),
    ).rejects.toThrow();
    await expect(
      db.exec(`insert into payment_shares (request_id, player_id, paid_at) values ('${id}', '${playerA}', now())`),
    ).rejects.toThrow();
    await db.exec(
      `insert into payment_shares (request_id, player_id, status, paid_at) values ('${id}', '${playerA}', 'paid', now())`,
    );
  });

  it("has to be reset to unpaid with its time cleared", async () => {
    const { rows } = await insertRequest();
    const id = rows[0].id;
    await db.exec(
      `insert into payment_shares (request_id, player_id, status, paid_at) values ('${id}', '${playerA}', 'paid', now())`,
    );
    await expect(db.exec(`update payment_shares set status = 'requested' where request_id = '${id}'`)).rejects.toThrow();
    await db.exec(`update payment_shares set status = 'requested', paid_at = null where request_id = '${id}'`);
  });

  it("refuses to delete a player who has a share, so the record cannot vanish", async () => {
    const { rows } = await insertRequest();
    await db.exec(`insert into payment_shares (request_id, player_id) values ('${rows[0].id}', '${playerB}')`);
    await expect(db.exec(`delete from players where id = '${playerB}'`)).rejects.toThrow();
  });

  it("removes its shares when a request is deleted", async () => {
    const { rows } = await insertRequest();
    const id = rows[0].id;
    await db.exec(`insert into payment_shares (request_id, player_id) values ('${id}', '${playerA}')`);
    await db.exec(`delete from payment_requests where id = '${id}'`);
    const left = await db.query<{ c: number }>(`select count(*) c from payment_shares where request_id = '${id}'`);
    expect(Number(left.rows[0].c)).toBe(0);
  });
});

describe("who can see it", () => {
  it("gives the browser no access to either table, to read or to write", async () => {
    const { rows } = await insertRequest();
    const requestId = rows[0].id;

    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      try {
        await expect(db.query("select * from payment_requests")).rejects.toThrow(/permission/);
        await expect(db.query("select * from payment_shares")).rejects.toThrow(/permission/);
        await expect(db.query("select payment_url from payment_requests")).rejects.toThrow(/permission/);
        await expect(db.exec(`update payment_requests set amount_cents = 1000 where id = '${requestId}'`)).rejects.toThrow(
          /permission/,
        );
        await expect(db.exec("delete from payment_shares")).rejects.toThrow(/permission/);
        await expect(
          db.exec(`insert into payment_shares (request_id, player_id) values ('${requestId}', '${playerA}')`),
        ).rejects.toThrow(/permission/);
      } finally {
        await db.exec("reset role");
      }
    }
  });
});
