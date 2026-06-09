# -*- coding: utf-8 -*-
"""Compare answers between original and copy Excel files"""
import os, sys, openpyxl
sys.stdout.reconfigure(encoding='utf-8')

desktop = os.path.join(os.environ['USERPROFILE'], 'Desktop')

# Find copy file
copy_files = [f for f in os.listdir(desktop) if '副本' in f and '2026' in f and '0316' in f and f.endswith('.xlsx') and not f.startswith('~')]
if not copy_files:
    print("ERROR: No copy file found!")
    exit(1)

copy_path = os.path.join(desktop, copy_files[0])
print(f"Loading copy file: {copy_files[0]}")
wb_copy = openpyxl.load_workbook(copy_path, read_only=True)
ws_copy = wb_copy.active

# Check header
header = [ws_copy.cell(1, c).value for c in range(1, 15)]
print(f"Copy header: {header}")

# Read all answers from copy
copy_answers = {}
for r in range(2, ws_copy.max_row + 1):
    q_id = ws_copy.cell(r, 2).value
    if q_id:
        # Determine which column has the answer based on header
        answer = ws_copy.cell(r, 9).value  # Assuming same layout
        copy_answers[int(q_id)] = str(answer).strip() if answer else ""

print(f"Copy file has {len(copy_answers)} questions")

# Show question 305 from copy
if 305 in copy_answers:
    print(f"\nQuestion 305 in copy: answer = '{copy_answers[305]}'")
    # Also show full row
    for r in range(2, ws_copy.max_row + 1):
        if ws_copy.cell(r, 2).value and int(ws_copy.cell(r, 2).value) == 305:
            print(f"  Row {r}:")
            for c in range(1, 11):
                print(f"    Col{c}: {ws_copy.cell(r, c).value}")
            break

wb_copy.close()

# Now compare with questions.js
import json
print("\n=== Comparing with questions.js ===")
with open(r'd:\code_test\quiz-app\questions.js', 'r', encoding='utf-8') as f:
    content = f.read()
questions = json.loads(content.replace('const QUESTIONS = ', '').rstrip(';\n'))

# Build dict from questions.js
js_answers = {q['id']: q['answer'] for q in questions}

# Find differences
diffs = []
for q_id in copy_answers:
    if q_id in js_answers:
        copy_ans = copy_answers[q_id].upper().replace(' ', '').replace(',', '').replace('、', '')
        js_ans = js_answers[q_id]
        # Normalize both
        import re
        copy_clean = ''.join(sorted(set(re.sub(r'[^A-D]', '', copy_ans))))
        js_clean = ''.join(sorted(set(re.sub(r'[^A-D]', '', js_ans))))
        if copy_clean != js_clean and copy_clean and js_clean:
            diffs.append((q_id, js_ans, copy_answers[q_id]))

print(f"Total differences found: {len(diffs)}")
if diffs:
    print("\nDifferences (first 30):")
    for q_id, js_ans, copy_ans in sorted(diffs)[:30]:
        q = next((x for x in questions if x['id'] == q_id), None)
        q_text = q['question'][:60] if q else "?"
        print(f"  ID={q_id}: JS='{js_ans}' vs Copy='{copy_ans}' | {q_text}")
