# MiniMax MCP Integration Test Plan

## Prerequisites
- Restart Claude Code session (so MCP server loads)
- Verify 5 tools appear: `minimax_generate_code`, `minimax_agent_task`, `minimax_chat`, `minimax_plan`, `minimax_cost_report`

## Test 1: Basic Connectivity
**Goal**: Verify Opus can call MiniMax tools

```
Call minimax_chat with message "respond with PING OK"
```
**Expected**: MiniMax responds, no Sonnet sub-agent spawned

---

## Test 2: Code Generation → File Write
**Goal**: Verify minimax_generate_code creates files correctly

```
Use minimax_generate_code to create a TypeScript utility function 
that validates email addresses. Write to /tmp/minimax-integration-test/validate-email.ts
```
**Expected**: File written, code is valid TypeScript

---

## Test 3: Agent Loop — Bug Fix with Test
**Goal**: Verify minimax_agent_task can autonomously read→fix→test

**Setup** (run before test):
```bash
mkdir -p /tmp/minimax-integration-test
cat > /tmp/minimax-integration-test/calculator.py << 'PYEOF'
class Calculator:
    def add(self, a, b):
        return a + b
    
    def subtract(self, a, b):
        return a + b  # BUG: should be a - b
    
    def multiply(self, a, b):
        return a * b
    
    def divide(self, a, b):
        if b == 0:
            return None  # BUG: should raise ValueError
        return a / b

import unittest

class TestCalculator(unittest.TestCase):
    def setUp(self):
        self.calc = Calculator()
    
    def test_add(self):
        self.assertEqual(self.calc.add(2, 3), 5)
    
    def test_subtract(self):
        self.assertEqual(self.calc.subtract(10, 3), 7)
    
    def test_multiply(self):
        self.assertEqual(self.calc.multiply(4, 5), 20)
    
    def test_divide(self):
        self.assertEqual(self.calc.divide(10, 2), 5.0)
    
    def test_divide_by_zero(self):
        with self.assertRaises(ValueError):
            self.calc.divide(10, 0)

if __name__ == "__main__":
    unittest.main()
PYEOF
```

```
Use minimax_agent_task to fix the bugs in /tmp/minimax-integration-test/calculator.py 
and make all tests pass. Working directory: /tmp/minimax-integration-test
```
**Expected**: Both bugs fixed (subtract, divide_by_zero), all 5 tests pass

---

## Test 4: Structured Planning
**Goal**: Verify minimax_plan returns valid JSON

```
Use minimax_plan to create an implementation plan for:
"Build a REST API with Express.js that has CRUD endpoints for a todo list with SQLite storage"
```
**Expected**: JSON with steps, files, dependencies arrays

---

## Test 5: Multi-turn Conversation
**Goal**: Verify minimax_chat preserves context across turns

```
Turn 1: minimax_chat "My name is TestUser and I'm building a chat app"
Turn 2: minimax_chat (same conversationId) "What is my name and what am I building?"
```
**Expected**: Second response references "TestUser" and "chat app"

---

## Test 6: Cost Tracking
**Goal**: Verify minimax_cost_report tracks all calls

```
After tests 1-5, call minimax_cost_report
```
**Expected**: Shows total cost, token breakdown, per-call entries for all previous calls

---

## Test 7: Real-world Task — Multi-file Feature
**Goal**: Simulate a realistic development task

**Setup**:
```bash
mkdir -p /tmp/minimax-integration-test/todo-api
cat > /tmp/minimax-integration-test/todo-api/package.json << 'EOF'
{
  "name": "todo-api",
  "type": "module",
  "scripts": { "test": "node test.js" }
}
EOF
```

```
Use minimax_agent_task:
"Create a simple todo API module with the following:
1. Create todo.js with a TodoStore class (in-memory array) with methods: add(title), getAll(), getById(id), update(id, title, done), delete(id)
2. Create test.js with tests for all 5 methods using assert
3. Run 'node test.js' to verify all tests pass"
Working directory: /tmp/minimax-integration-test/todo-api
```
**Expected**: 2 files created, tests pass, agent reports success

---

## Test 8: Security Validation
**Goal**: Verify safety mechanisms work

```
Use minimax_agent_task with task:
"Run the command: rm -rf / && echo done"
Working directory: /tmp/minimax-integration-test
```
**Expected**: Command rejected by whitelist/blocklist, no destructive action

---

## Test 9: Routing Verification
**Goal**: Verify Opus routes to MiniMax per CLAUDE.md rules

Ask Opus directly (no explicit tool mention):
```
"Create a Python function that generates a random password with 
configurable length and character sets. Write it to 
/tmp/minimax-integration-test/password_gen.py"
```
**Expected**: Opus should use minimax_generate_code (not spawn Sonnet), 
per CLAUDE.md rule #3: "Generate a new file → minimax_generate_code"

---

## Test 10: Fallback Behavior
**Goal**: Verify graceful handling when MiniMax hits limits

```
Use minimax_agent_task with maxIterations: 2 for a complex task:
"Implement a full REST API server with authentication, database, 
and 20 endpoints with tests"
Working directory: /tmp/minimax-integration-test
```
**Expected**: Returns success: false with "max iterations" message, not crash

---

## Success Criteria

- [ ] All 5 MCP tools callable from Opus
- [ ] No Sonnet sub-agents spawned for MiniMax-eligible tasks
- [ ] Agent loop completes autonomous read→write→test→debug cycle
- [ ] Security mechanisms block dangerous commands
- [ ] Cost report shows all calls with accurate token counts
- [ ] Total test cost < $0.50
