---
name: craft-glirol-rest
description: "mcp__craft__place: use the craft-table tools to discover and execute the recipe for obtaining glirol. Use when an unfamiliar crafting table contains unknown ingredients and the goal is to hold one glirol."
version: 1.0.0
source-workspace-hash: ws_8ea2612f990efb0c
distilled-at: 2026-10-01T11:58:33Z
grounding-score: 1.00
nams-provenance-id: prov_run-33121368-1136-49c6-b743-c23cccffd65e
source-memory-types: [short-term, long-term, reasoning]
procedure-format: graph
---

# Craft Glirol Rest

mcp__craft__place: use the craft-table tools to discover and execute the recipe for obtaining glirol. Use when an unfamiliar crafting table contains unknown ingredients and the goal is to hold one glirol.

## Procedure (execution graph)
Steps run in order; each is grounded in workspace memory (see `provenance.json`).

1. **Read crafting help** _(tool: mcp__craft__help)_
   Call mcp__craft__help before taking any crafting action.
   - why: The task explicitly requires starting with help so the available craft operations are known before exploration.
   - outputs: coordinates, preview, tools, world
   - expect: success
   - done when: The mcp__craft__help call returns success.
   _evidence: 5f75329e-3f3e-47cb-aa68-1aad22ea5d2a, 6e4ee227-1244-4d24-b1cb-46673960045a, 2eb4fe49-8581-488a-87db-6b1c6db8bf4f, 406b0577-6605-441e-8589-7392e2d5b89c_

2. **Inspect inventory** _(tool: mcp__craft__inventory)_
   Call mcp__craft__inventory to identify available ingredients and quantities.
   - why: Inventory inspection reveals whether the ingredients needed for the candidate recipe are available.
   - after: step-001
   - outputs: items
   - expect: success
   - done when: The mcp__craft__inventory call returns success and the available ingredients are visible.
   _evidence: f755eda5-bacb-4026-b571-e77b136c1e3e, 96c1fb88-937f-423c-bf86-e9cfe2f234b0, efed5df7-62e9-41b6-92cc-f1c71b8972ec, 2eb4fe49-8581-488a-87db-6b1c6db8bf4f, 406b0577-6605-441e-8589-7392e2d5b89c, 735d607e-3ee6-4d08-b421-f422d949c57f_

3. **Place candidate ingredients** _(tool: mcp__craft__place)_
   Use mcp__craft__place to arrange the candidate ingredients in the crafting-table layout.
   - why: The successful case made glirol by arranging two lugli side by side in the top row before crafting.
   - after: step-002
   - inputs: col, item, row
   - outputs: craftable, grid, ok
   - expect: success
   - done when: Two lugli are visibly placed side by side in the top row.
   _evidence: 93677557-8382-4888-a54c-3ed5a52fd2e3, badb4c1f-f470-4955-9cf9-e948ccbd6c84, d5200cff-28c8-4b35-ae54-cd15b2ec5ac6, 2fde5e22-95ae-43c3-bc8f-cdd5d77b7093, 89b1b2a9-b208-4518-b292-4a487cc5df3f, 61629c7f-9b9f-4bcb-843f-67ae157dc4ed, 1e41dbfe-9a44-43e0-956d-cb6126520fb5, c0a9f9f6-238a-4303-92c1-fd6a7fbfaea4, 3757c056-934e-45b4-9a61-dba339d892b8, 9716cdaf-f30d-4f0c-8322-2b07683e2a04, ac5df6a7-ba31-41d7-bed3-33af69b5665e, 637a3bf0-07e8-43b4-b54d-19cdbd69b469, d81312e5-2151-4946-b31f-25fed3ef8a85, bbe54d49-fc9b-4947-ad7d-e436a6ef5d14, 59ef19e6-6d73-4901-9ec4-14685ffb8816, 93c02b3b-d582-4a75-825b-31734cefc96e, cc042040-286e-4b81-81d6-a4bbfe7960ff, 3ceeb639-7f25-4342-9e74-eccb3225db1a, 53a35069-80f1-431c-b857-8eae8e937506, 84582ce3-d76e-450b-882e-e0db0d8bf521, aa93b930-a563-426d-bb8b-c164aceb4419, f044a47e-a73c-4dc3-ab44-421dacf4efe4, 7e1c63fc-2a40-4233-91fa-1ed0d6016354, 6b2275da-411c-4016-8f5e-6ba65f34f3a2, 30060475-56fb-4fb8-805b-0f08052a8859, 3e33c11c-b14d-4274-81c7-0c9b9d9c00c2, 2c2f7199-5bf4-4af2-9ceb-d35b0a10da17, badae659-aadf-4116-9b14-c3e3a5217668, 7562a706-2929-4af7-be4d-8285d2a0004a, 4fdda9f9-3bf6-465e-b4e0-9da8e683662e, 884a74a4-d265-4299-bccb-ebc371f9883f, 3c5eb7af-843b-491d-a218-a52321324d83, fae0f2ca-12ca-4c86-9396-3124ee655592, cd8a81ef-744d-4acd-9e7f-184931618ae7, 4a5a0522-072f-461f-9635-7a7b90e32e6f, 69123081-4788-4346-971a-33a670dacbb3, afa983e4-556e-48da-99bc-72d0c81b92a4, 7c7fe1b9-2be6-409b-9e83-10b555891cc4, 775068f9-6459-427d-aa75-13f9dcc9c2a3, 99522367-81ff-4272-a387-cf96ca6b4814, a2969623-e3a8-44a1-9e5c-c732f8e36403, 207bf9fb-80bf-4d65-af58-98babd7dd40d, b305dd11-f7e7-48c0-b028-19ff6c65883d, 79eb73d8-e6b4-401e-adaa-80eb1cefd328, dd2acc56-c9ad-4baa-8c9d-6df1f65cbb63, 7c07f034-e076-438b-9d2f-f7265b03223a, 5161e89f-d68e-4917-91dc-d1df14026e47, fafcffe1-1565-40fc-afec-95fb89b977c8, 1cc39636-1752-4b1e-9e99-7f59d7b550d9, 869e4b9b-5c4d-4f07-94fe-0f9fac58dfa0, 1ec33d9f-5a97-4a9d-9b79-ec19903f4549, f651cb19-d3ca-466f-9f75-805aa1435c93, 6a72c3c1-ca8c-4f66-b7d3-39cf190c2080, a2a86d8a-2b0a-4576-b200-1297c96ed675, bb55c124-e767-44be-9f61-a13aabf40b56, e0d276f0-2e0f-4830-b3b7-48e7766e05a2, b3d8a552-21b8-4fbf-ab56-4460e64e380d, 85bbb6aa-d6b0-4556-b53d-5e1fa3ffcce3, 9711d03d-759f-4684-8553-23f8e015e16e, 001dd979-5f88-42be-9a9f-bf099d2e655d, 55d66bbe-2a3b-47c2-aaa4-afaf5ef1655c, b5c2273b-3a16-441c-8b51-6a3bb63859b5, 6724ee2c-9333-4ac9-a590-70e0053b0545, 2eb4fe49-8581-488a-87db-6b1c6db8bf4f, e170e10d-766b-4b84-8d50-d0ad2d0af335_

4. **Clear the table** _(tool: mcp__craft__clear)_
   Use mcp__craft__clear to remove the current table contents when resetting an exploratory layout.
   - why: The table contents can be explored and reset before committing because crafting consumes the table contents irreversibly.
   - after: step-003
   - outputs: craftable, grid, ok
   - expect: success
   - done when: The mcp__craft__clear call returns success and the table is empty.
   _evidence: 5f287226-815c-4d64-ab43-13e7ffe74dce, b829f499-714c-47db-85ee-c11290ecfa07, a071e527-beea-4b7a-8e78-6d9436ee496f, d311ab43-fd85-4a19-ad8d-8dbc06b7bb20, b8478c14-a9ea-4064-a40e-a77636a47d17, 141903eb-9392-4195-83c0-8eb777c18baf, 8a7a5711-5eda-4b5b-9bfb-18c35eec4f7b, 6e361e87-54c8-4d83-93a2-e18131de838e, f38b6a36-5030-4445-8424-8edca5b4c297, 1ef21483-45c2-4004-a3e1-8a625d9875f1, 0cb3eec0-cd0c-4421-88ce-7d943e7c88c8, e1a85d98-01dc-481c-b16c-fcb461f1ff85, 7b18c891-4724-4c4e-abc9-3d1a7a62ec08, 343073ca-148f-4b9e-821d-be741ae09930, ad757b78-71aa-4a4b-b33f-a6fac3b123de, eac9b1ef-5c5c-4015-9b0c-6eb87646b1be, 650a96ec-93ce-4223-ba78-f3c89c9ec929, 2eb4fe49-8581-488a-87db-6b1c6db8bf4f, 717898b2-5f18-45f8-b2f7-e0fc7133b5e3_

5. **Remove selected items** _(tool: mcp__craft__remove)_
   Use mcp__craft__remove to take specific placed items off the table during exploration.
   - why: Removing items provides a reversible way to adjust an exploratory layout before the irreversible craft.
   - after: step-004
   - inputs: col, row
   - outputs: craftable, grid, ok
   - expect: success
   - done when: The mcp__craft__remove call returns success and the selected item is no longer in its prior table position.
   _evidence: 47732498-1b88-449f-9980-137a18335815, f7db7e6d-da27-4787-9d56-aadc0206f6d1, 8003b228-6bbd-4ca7-b7fc-8885eb61b249, 7b218796-8294-4ddc-8ea3-a05a52a19eb9, ae02b5bf-feb2-4670-b9e1-633b854813f7, 676d6def-1bd3-4621-a14b-337afd4d3123, 9587ca44-8ab2-431d-8ced-1a59dc1d3225, 36959bc7-3927-4d87-ae22-a0d3d76e4293, f86b9e97-505f-4489-9a47-219f04e88c9c, 8bee7ee2-e1ce-40cd-926e-b68bbf42365b, 343786b8-66af-4f51-ac86-277038c1dcb2, 60635b35-655b-4171-8f1b-97aaf473288e, ea0d22da-6f0d-4ff4-848e-dfc2a3f44f75, eae97194-9450-443f-acfd-e0050a2a6019, 993a4126-a9a8-4b7f-afb0-1d48d8785782, 2eb4fe49-8581-488a-87db-6b1c6db8bf4f, 320a3520-e7e9-48d8-bed5-76af34a092f0_

6. **Craft the target** _(tool: mcp__craft__craft)_
   Invoke mcp__craft__craft only after the verified glirol layout is ready.
   - why: The recorded successful outcome came from crafting the verified two-lugli top-row arrangement.
   - after: step-005
   - outputs: crafted, ok
   - expect: success
   - done when: The mcp__craft__craft call returns success and one glirol is held.
   _evidence: 5e3300d5-c827-4be7-9347-52f7686df9a7, 7489cdb4-37c7-4097-a726-e4d30fac59bd, b9d30093-2074-4839-9499-8172a7b812f0, 03dbfc78-ea8d-4f65-b957-858694087564, 114fdb4f-140c-44c9-87cb-fd4a15e3771f, 2eb4fe49-8581-488a-87db-6b1c6db8bf4f, 968fd72d-1963-45d7-b737-3e680c6fe5f7_


## Domain model
Key entities and terms are defined in `references/domain-model.md`.

## Worked examples
Representative (redacted) cases are in `references/exemplars.md`.

> Distilled from NAMS workspace memory. Every claim is grounded — see `provenance.json`.
