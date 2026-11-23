import { expect } from "chai";
import { ethers } from "hardhat";
import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

const ONE_DAY = 24 * 60 * 60;
const REWARD = ethers.parseEther("0.05");
const Status = { Open: 0n, Accepted: 1n, Submitted: 2n, Completed: 3n, Cancelled: 4n };
const DEFAULT_AGENT_ID = "0x60b9262456de011f7d15a54cdd8c48baaa8b022f";

async function deployFixture() {
  const [owner, alice, bob, carol, outsider] = await ethers.getSigners();
  const agentId = await ethers.deployContract("MockAgentID");
  const board = await ethers.deployContract("AgentTaskBoard", [await agentId.getAddress(), owner.address]);
  for (const s of [alice, bob, carol]) await agentId.mint(s.address);
  return { board, agentId, owner, alice, bob, carol, outsider };
}

async function registeredFixture() {
  const f = await deployFixture();
  await f.board.connect(f.alice).registerAgent("alice.ai");
  await f.board.connect(f.bob).registerAgent("bob.ai");
  await f.board.connect(f.carol).registerAgent("carol.ai");
  return f;
}

async function deadlineIn(seconds: number) {
  return (await time.latest()) + seconds;
}

async function postedFixture() {
  const f = await registeredFixture();
  const deadline = await deadlineIn(7 * ONE_DAY);
  await f.board.connect(f.alice).postTask("Summarise a whitepaper", "Give a 200-word summary", deadline, { value: REWARD });
  return { ...f, deadline, taskId: 0n };
}

async function acceptedFixture() {
  const f = await postedFixture();
  await f.board.connect(f.bob).acceptTask(f.taskId);
  return f;
}

async function submittedFixture() {
  const f = await acceptedFixture();
  await f.board.connect(f.bob).completeTask(f.taskId, "ipfs://result-cid");
  return f;
}

async function completedFixture() {
  const f = await submittedFixture();
  await f.board.connect(f.alice).confirmCompletion(f.taskId);
  return f;
}

describe("AgentTaskBoard", function () {
  describe("deployment", function () {
    it("stores the configured Agent ID contract and owner", async function () {
      const { board, agentId, owner } = await loadFixture(deployFixture);
      expect(await board.agentId()).to.equal(await agentId.getAddress());
      expect(await board.owner()).to.equal(owner.address);
      expect(await board.paused()).to.equal(false);
    });

    it("defaults to the BNB Chain Agent ID address", async function () {
      const { board } = await loadFixture(deployFixture);
      expect((await board.DEFAULT_AGENT_ID()).toLowerCase()).to.equal(DEFAULT_AGENT_ID);
    });

    it("uses DEFAULT_AGENT_ID when address(0) is passed (reverts locally: no code there)", async function () {
      const [owner] = await ethers.getSigners();
      const Board = await ethers.getContractFactory("AgentTaskBoard");
      await expect(Board.deploy(ethers.ZeroAddress, owner.address)).to.be.revertedWithCustomError(
        Board,
        "InvalidAgentIdContract",
      );
    });

    it("uses DEFAULT_AGENT_ID when address(0) is passed and code exists there", async function () {
      const [owner] = await ethers.getSigners();
      const mock = await ethers.deployContract("MockAgentID");
      const code = await ethers.provider.getCode(await mock.getAddress());
      await ethers.provider.send("hardhat_setCode", [DEFAULT_AGENT_ID, code]);
      const board = await ethers.deployContract("AgentTaskBoard", [ethers.ZeroAddress, owner.address]);
      expect((await board.agentId()).toLowerCase()).to.equal(DEFAULT_AGENT_ID);
    });

    it("rejects an EOA as the Agent ID contract", async function () {
      const [owner, other] = await ethers.getSigners();
      const Board = await ethers.getContractFactory("AgentTaskBoard");
      await expect(Board.deploy(other.address, owner.address)).to.be.revertedWithCustomError(
        Board,
        "InvalidAgentIdContract",
      );
    });
  });

  describe("Agent ID gating", function () {
    it("reports holder status from balanceOf", async function () {
      const { board, alice, outsider } = await loadFixture(deployFixture);
      expect(await board.isAgentIdHolder(alice.address)).to.equal(true);
      expect(await board.isAgentIdHolder(outsider.address)).to.equal(false);
    });

    it("rejects registration from a non-holder", async function () {
      const { board, outsider } = await loadFixture(deployFixture);
      await expect(board.connect(outsider).registerAgent("mallory.ai")).to.be.revertedWithCustomError(
        board,
        "NotAgentIdHolder",
      );
    });

    it("rejects posting from a non-holder", async function () {
      const { board, outsider } = await loadFixture(registeredFixture);
      const deadline = await deadlineIn(ONE_DAY);
      await expect(
        board.connect(outsider).postTask("t", "d", deadline, { value: REWARD }),
      ).to.be.revertedWithCustomError(board, "NotAgentIdHolder");
    });

    it("rejects accepting from a non-holder", async function () {
      const { board, outsider, taskId } = await loadFixture(postedFixture);
      await expect(board.connect(outsider).acceptTask(taskId)).to.be.revertedWithCustomError(board, "NotAgentIdHolder");
    });

    it("rejects completing from a worker who lost their Agent ID", async function () {
      const { board, agentId, bob, taskId } = await loadFixture(acceptedFixture);
      const tokenId = 2n; // bob was minted second
      expect(await agentId.ownerOf(tokenId)).to.equal(bob.address);
      await agentId.connect(bob).burn(tokenId);
      await expect(board.connect(bob).completeTask(taskId, "done")).to.be.revertedWithCustomError(
        board,
        "NotAgentIdHolder",
      );
    });

    it("rejects rating from a non-holder", async function () {
      const { board, agentId, alice, taskId } = await loadFixture(completedFixture);
      await agentId.connect(alice).burn(1n);
      await expect(board.connect(alice).rateTask(taskId, 5, "")).to.be.revertedWithCustomError(
        board,
        "NotAgentIdHolder",
      );
    });

    it("requires registration (not just an Agent ID) to post and accept", async function () {
      const { board, agentId, outsider, taskId } = await loadFixture(postedFixture);
      await agentId.mint(outsider.address);
      const deadline = await deadlineIn(ONE_DAY);
      await expect(
        board.connect(outsider).postTask("t", "d", deadline, { value: REWARD }),
      ).to.be.revertedWithCustomError(board, "NotRegistered");
      await expect(board.connect(outsider).acceptTask(taskId)).to.be.revertedWithCustomError(board, "NotRegistered");
    });

    it("the mock Agent ID is non-transferable", async function () {
      const { agentId, alice, outsider } = await loadFixture(deployFixture);
      await expect(
        agentId.connect(alice).transferFrom(alice.address, outsider.address, 1n),
      ).to.be.revertedWithCustomError(agentId, "NonTransferable");
    });
  });

  describe("registration", function () {
    it("registers an Agent ID holder by name and emits AgentRegistered", async function () {
      const { board, alice } = await loadFixture(deployFixture);
      await expect(board.connect(alice).registerAgent("alice.ai"))
        .to.emit(board, "AgentRegistered")
        .withArgs(alice.address, "alice.ai", anyValue);
      const a = await board.getAgent(alice.address);
      expect(a.name).to.equal("alice.ai");
      expect(a.registeredAt).to.be.greaterThan(0n);
      expect(await board.isRegistered(alice.address)).to.equal(true);
      expect(await board.agentByName("alice.ai")).to.equal(alice.address);
      expect(await board.agentCount()).to.equal(1n);
      expect(await board.getAgents(0, 10)).to.deep.equal([alice.address]);
    });

    it("rejects double registration", async function () {
      const { board, alice } = await loadFixture(registeredFixture);
      await expect(board.connect(alice).registerAgent("alice2.ai")).to.be.revertedWithCustomError(
        board,
        "AlreadyRegistered",
      );
    });

    it("rejects a name already taken", async function () {
      const { board, agentId, outsider } = await loadFixture(registeredFixture);
      await agentId.mint(outsider.address);
      await expect(board.connect(outsider).registerAgent("alice.ai")).to.be.revertedWithCustomError(board, "NameTaken");
    });

    for (const bad of ["ab", "Alice.ai", "has space", "emoji😀", "x".repeat(65), "semi;colon"]) {
      it(`rejects invalid name ${JSON.stringify(bad.length > 20 ? bad.slice(0, 10) + "..." : bad)}`, async function () {
        const { board, alice } = await loadFixture(deployFixture);
        await expect(board.connect(alice).registerAgent(bad)).to.be.revertedWithCustomError(board, "InvalidName");
      });
    }

    it("accepts names at the length limits and with allowed symbols", async function () {
      const { board, alice, bob } = await loadFixture(deployFixture);
      await board.connect(alice).registerAgent("a-b");
      await board.connect(bob).registerAgent("z".repeat(60) + "_.ai");
      expect((await board.getAgent(bob.address)).name.length).to.equal(64);
    });
  });

  describe("posting tasks", function () {
    it("escrows the BNB reward and emits TaskPosted", async function () {
      const { board, alice } = await loadFixture(registeredFixture);
      const deadline = await deadlineIn(3 * ONE_DAY);
      const tx = board.connect(alice).postTask("Label 50 images", "details", deadline, { value: REWARD });
      await expect(tx)
        .to.emit(board, "TaskPosted")
        .withArgs(0n, alice.address, REWARD, deadline, "Label 50 images");
      await expect(tx).to.changeEtherBalances([alice, board], [-REWARD, REWARD]);
      const t = await board.getTask(0);
      expect(t.poster).to.equal(alice.address);
      expect(t.reward).to.equal(REWARD);
      expect(t.status).to.equal(Status.Open);
      expect(t.description).to.equal("details");
      expect(await board.taskCount()).to.equal(1n);
      expect(await board.totalEscrowed()).to.equal(REWARD);
      expect((await board.getAgent(alice.address)).tasksPosted).to.equal(1n);
    });

    it("rejects a zero reward", async function () {
      const { board, alice } = await loadFixture(registeredFixture);
      const deadline = await deadlineIn(ONE_DAY);
      await expect(board.connect(alice).postTask("t", "d", deadline)).to.be.revertedWithCustomError(board, "NoReward");
    });

    it("rejects empty / oversized title and oversized description", async function () {
      const { board, alice } = await loadFixture(registeredFixture);
      const deadline = await deadlineIn(ONE_DAY);
      await expect(
        board.connect(alice).postTask("", "d", deadline, { value: REWARD }),
      ).to.be.revertedWithCustomError(board, "InvalidInput");
      await expect(
        board.connect(alice).postTask("x".repeat(121), "d", deadline, { value: REWARD }),
      ).to.be.revertedWithCustomError(board, "InvalidInput");
      await expect(
        board.connect(alice).postTask("t", "x".repeat(2001), deadline, { value: REWARD }),
      ).to.be.revertedWithCustomError(board, "InvalidInput");
    });

    it("rejects past and too-distant deadlines", async function () {
      const { board, alice } = await loadFixture(registeredFixture);
      const now = await time.latest();
      await expect(
        board.connect(alice).postTask("t", "d", now, { value: REWARD }),
      ).to.be.revertedWithCustomError(board, "InvalidDeadline");
      await expect(
        board.connect(alice).postTask("t", "d", now + 366 * ONE_DAY, { value: REWARD }),
      ).to.be.revertedWithCustomError(board, "InvalidDeadline");
    });

    it("paginates tasks", async function () {
      const { board, alice } = await loadFixture(registeredFixture);
      const deadline = await deadlineIn(ONE_DAY);
      for (let i = 0; i < 5; i++) {
        await board.connect(alice).postTask(`task ${i}`, "", deadline, { value: 1n });
      }
      const page = await board.getTasks(1, 2);
      expect(page.map((t) => t.title)).to.deep.equal(["task 1", "task 2"]);
      expect((await board.getTasks(4, 10)).length).to.equal(1);
      expect((await board.getTasks(5, 10)).length).to.equal(0);
      await expect(board.getTask(5)).to.be.revertedWithCustomError(board, "TaskNotFound");
    });
  });

  describe("accepting tasks", function () {
    it("assigns the worker and emits TaskAccepted", async function () {
      const { board, bob, taskId } = await loadFixture(postedFixture);
      await expect(board.connect(bob).acceptTask(taskId)).to.emit(board, "TaskAccepted").withArgs(taskId, bob.address);
      const t = await board.getTask(taskId);
      expect(t.worker).to.equal(bob.address);
      expect(t.status).to.equal(Status.Accepted);
    });

    it("rejects accepting your own task", async function () {
      const { board, alice, taskId } = await loadFixture(postedFixture);
      await expect(board.connect(alice).acceptTask(taskId)).to.be.revertedWithCustomError(board, "CannotAcceptOwnTask");
    });

    it("rejects accepting a task that is already taken", async function () {
      const { board, carol, taskId } = await loadFixture(acceptedFixture);
      await expect(board.connect(carol).acceptTask(taskId)).to.be.revertedWithCustomError(board, "WrongStatus");
    });

    it("rejects accepting after the deadline", async function () {
      const { board, bob, taskId, deadline } = await loadFixture(postedFixture);
      await time.increaseTo(deadline);
      await expect(board.connect(bob).acceptTask(taskId)).to.be.revertedWithCustomError(board, "DeadlinePassed");
    });

    it("rejects a non-existent task", async function () {
      const { board, bob } = await loadFixture(postedFixture);
      await expect(board.connect(bob).acceptTask(99)).to.be.revertedWithCustomError(board, "TaskNotFound");
    });

    it("lets the worker withdraw so the task reopens", async function () {
      const { board, bob, carol, taskId } = await loadFixture(acceptedFixture);
      await expect(board.connect(carol).withdrawFromTask(taskId)).to.be.revertedWithCustomError(board, "NotWorker");
      await expect(board.connect(bob).withdrawFromTask(taskId))
        .to.emit(board, "TaskWithdrawn")
        .withArgs(taskId, bob.address);
      const t = await board.getTask(taskId);
      expect(t.status).to.equal(Status.Open);
      expect(t.worker).to.equal(ethers.ZeroAddress);
      expect((await board.getAgent(bob.address)).tasksAbandoned).to.equal(1n);
      await board.connect(carol).acceptTask(taskId);
      expect((await board.getTask(taskId)).worker).to.equal(carol.address);
    });
  });

  describe("completing tasks", function () {
    it("records the result and emits TaskCompleted", async function () {
      const { board, bob, taskId } = await loadFixture(acceptedFixture);
      await expect(board.connect(bob).completeTask(taskId, "ipfs://cid"))
        .to.emit(board, "TaskCompleted")
        .withArgs(taskId, bob.address, "ipfs://cid");
      const t = await board.getTask(taskId);
      expect(t.status).to.equal(Status.Submitted);
      expect(t.result).to.equal("ipfs://cid");
      expect(t.submittedAt).to.be.greaterThan(0n);
    });

    it("only the assigned worker can complete", async function () {
      const { board, carol, taskId } = await loadFixture(acceptedFixture);
      await expect(board.connect(carol).completeTask(taskId, "x")).to.be.revertedWithCustomError(board, "NotWorker");
    });

    it("cannot complete an open task", async function () {
      const { board, bob, taskId } = await loadFixture(postedFixture);
      await expect(board.connect(bob).completeTask(taskId, "x")).to.be.revertedWithCustomError(board, "WrongStatus");
    });

    it("cannot complete after the deadline", async function () {
      const { board, bob, taskId, deadline } = await loadFixture(acceptedFixture);
      await time.increaseTo(deadline + 1);
      await expect(board.connect(bob).completeTask(taskId, "x")).to.be.revertedWithCustomError(board, "DeadlinePassed");
    });

    it("rejects an empty or oversized result", async function () {
      const { board, bob, taskId } = await loadFixture(acceptedFixture);
      await expect(board.connect(bob).completeTask(taskId, "")).to.be.revertedWithCustomError(board, "InvalidInput");
      await expect(board.connect(bob).completeTask(taskId, "x".repeat(501))).to.be.revertedWithCustomError(
        board,
        "InvalidInput",
      );
    });
  });

  describe("payment escrow and release", function () {
    it("poster confirmation releases the BNB reward to the worker", async function () {
      const { board, alice, bob, taskId } = await loadFixture(submittedFixture);
      const tx = board.connect(alice).confirmCompletion(taskId);
      await expect(tx).to.emit(board, "PaymentReleased").withArgs(taskId, bob.address, REWARD, true);
      await expect(tx).to.changeEtherBalances([board, bob], [-REWARD, REWARD]);
      expect((await board.getTask(taskId)).status).to.equal(Status.Completed);
      const w = await board.getAgent(bob.address);
      expect(w.tasksCompleted).to.equal(1n);
      expect(w.earned).to.equal(REWARD);
      const p = await board.getAgent(alice.address);
      expect(p.tasksPaid).to.equal(1n);
      expect(p.spent).to.equal(REWARD);
      expect(await board.totalEscrowed()).to.equal(0n);
      expect(await board.totalPaidOut()).to.equal(REWARD);
      expect(await board.totalCompleted()).to.equal(1n);
    });

    it("only the poster can confirm, and only once", async function () {
      const { board, alice, bob, carol, taskId } = await loadFixture(submittedFixture);
      await expect(board.connect(bob).confirmCompletion(taskId)).to.be.revertedWithCustomError(board, "NotPoster");
      await expect(board.connect(carol).confirmCompletion(taskId)).to.be.revertedWithCustomError(board, "NotPoster");
      await board.connect(alice).confirmCompletion(taskId);
      await expect(board.connect(alice).confirmCompletion(taskId)).to.be.revertedWithCustomError(board, "WrongStatus");
    });

    it("cannot confirm before work is submitted", async function () {
      const { board, alice, taskId } = await loadFixture(acceptedFixture);
      await expect(board.connect(alice).confirmCompletion(taskId)).to.be.revertedWithCustomError(board, "WrongStatus");
    });

    it("worker can claim only after the review period if the poster is silent", async function () {
      const { board, bob, carol, taskId } = await loadFixture(submittedFixture);
      await expect(board.connect(bob).claimPayment(taskId)).to.be.revertedWithCustomError(board, "TooEarly");
      await time.increase(3 * ONE_DAY);
      await expect(board.connect(carol).claimPayment(taskId)).to.be.revertedWithCustomError(board, "NotWorker");
      const tx = board.connect(bob).claimPayment(taskId);
      await expect(tx).to.emit(board, "PaymentReleased").withArgs(taskId, bob.address, REWARD, false);
      await expect(tx).to.changeEtherBalances([board, bob], [-REWARD, REWARD]);
    });

    it("confirmation still works when the poster lost their Agent ID (funds never stuck)", async function () {
      const { board, agentId, alice, bob, taskId } = await loadFixture(submittedFixture);
      await agentId.connect(alice).burn(1n);
      await expect(board.connect(alice).confirmCompletion(taskId)).to.changeEtherBalance(bob, REWARD);
    });

    it("reverts the whole release if the worker refuses BNB", async function () {
      const { board, agentId, alice } = await loadFixture(registeredFixture);
      const agent = await ethers.deployContract("TestAgent", [await board.getAddress()]);
      await agentId.mint(await agent.getAddress());
      await agent.register("contract-agent.ai");
      const deadline = await deadlineIn(ONE_DAY);
      await board.connect(alice).postTask("t", "", deadline, { value: REWARD });
      await agent.accept(0);
      await agent.complete(0, "done");
      await agent.setRejectPayments(true);
      await expect(board.connect(alice).confirmCompletion(0)).to.be.revertedWithCustomError(board, "TransferFailed");
      expect((await board.getTask(0)).status).to.equal(Status.Submitted);
      await agent.setRejectPayments(false);
      await board.connect(alice).confirmCompletion(0);
      expect(await ethers.provider.getBalance(await agent.getAddress())).to.equal(REWARD);
    });

    it("blocks reentrancy during payment", async function () {
      const { board, agentId, alice } = await loadFixture(registeredFixture);
      const agent = await ethers.deployContract("TestAgent", [await board.getAddress()]);
      const agentAddr = await agent.getAddress();
      await agentId.mint(agentAddr);
      await agent.register("contract-agent.ai");
      const deadline = await deadlineIn(ONE_DAY);
      await agent.post("agent's own task", deadline, { value: REWARD }); // task 0, posted by the contract
      await board.connect(alice).postTask("t", "", deadline, { value: REWARD }); // task 1
      await agent.accept(1);
      await agent.complete(1, "done");
      await agent.setReenter(true, 0); // on receiving payment, try to cancelTask(0)
      await expect(board.connect(alice).confirmCompletion(1)).to.be.revertedWithCustomError(board, "TransferFailed");
      expect((await board.getTask(0)).status).to.equal(Status.Open);
      expect(await board.totalEscrowed()).to.equal(2n * REWARD);
    });
  });

  describe("revisions", function () {
    it("poster can request a revision; worker resubmits; deadline is extended if needed", async function () {
      const { board, alice, bob } = await loadFixture(registeredFixture);
      const deadline = await deadlineIn(ONE_DAY);
      await board.connect(alice).postTask("short", "", deadline, { value: REWARD });
      const taskId = 0n;
      await board.connect(bob).acceptTask(taskId);
      await time.increaseTo(deadline - 120);
      await board.connect(bob).completeTask(taskId, "v1");
      await expect(board.connect(alice).requestRevision(taskId, "please add sources")).to.emit(
        board,
        "RevisionRequested",
      );
      const t = await board.getTask(taskId);
      expect(t.status).to.equal(Status.Accepted);
      expect(t.revisions).to.equal(1n);
      expect(t.deadline).to.be.greaterThanOrEqual(BigInt((await time.latest()) + 2 * ONE_DAY));
      await board.connect(bob).completeTask(taskId, "v2");
      expect((await board.getTask(taskId)).result).to.equal("v2");
    });

    it("limits revisions and the review window", async function () {
      const { board, alice, bob, taskId } = await loadFixture(submittedFixture);
      await expect(board.connect(bob).requestRevision(taskId, "")).to.be.revertedWithCustomError(board, "NotPoster");
      await board.connect(alice).requestRevision(taskId, "1");
      await board.connect(bob).completeTask(taskId, "v2");
      await board.connect(alice).requestRevision(taskId, "2");
      await board.connect(bob).completeTask(taskId, "v3");
      await expect(board.connect(alice).requestRevision(taskId, "3")).to.be.revertedWithCustomError(
        board,
        "TooManyRevisions",
      );
      await time.increase(3 * ONE_DAY);
      await expect(board.connect(alice).requestRevision(taskId, "late")).to.be.revertedWithCustomError(
        board,
        "DeadlinePassed",
      );
    });
  });

  describe("cancellation and refund", function () {
    it("poster can cancel an open task and is refunded", async function () {
      const { board, alice, bob, taskId } = await loadFixture(postedFixture);
      await expect(board.connect(bob).cancelTask(taskId)).to.be.revertedWithCustomError(board, "NotPoster");
      const tx = board.connect(alice).cancelTask(taskId);
      await expect(tx).to.emit(board, "TaskCancelled").withArgs(taskId, alice.address, REWARD, false);
      await expect(tx).to.changeEtherBalances([board, alice], [-REWARD, REWARD]);
      expect((await board.getTask(taskId)).status).to.equal(Status.Cancelled);
      expect(await board.totalEscrowed()).to.equal(0n);
      await expect(board.connect(bob).acceptTask(taskId)).to.be.revertedWithCustomError(board, "WrongStatus");
      await expect(board.connect(alice).cancelTask(taskId)).to.be.revertedWithCustomError(board, "WrongStatus");
    });

    it("poster cannot cancel an accepted task before the deadline", async function () {
      const { board, alice, taskId } = await loadFixture(acceptedFixture);
      await expect(board.connect(alice).cancelTask(taskId)).to.be.revertedWithCustomError(board, "TooEarly");
    });

    it("poster is refunded if the worker misses the deadline", async function () {
      const { board, alice, bob, taskId, deadline } = await loadFixture(acceptedFixture);
      await time.increaseTo(deadline + 1);
      const tx = board.connect(alice).cancelTask(taskId);
      await expect(tx).to.emit(board, "TaskCancelled").withArgs(taskId, alice.address, REWARD, true);
      await expect(tx).to.changeEtherBalance(alice, REWARD);
      expect((await board.getAgent(bob.address)).tasksAbandoned).to.equal(1n);
    });

    it("cannot cancel once work is submitted or paid", async function () {
      const { board, alice, taskId } = await loadFixture(submittedFixture);
      await expect(board.connect(alice).cancelTask(taskId)).to.be.revertedWithCustomError(board, "WrongStatus");
      await board.connect(alice).confirmCompletion(taskId);
      await expect(board.connect(alice).cancelTask(taskId)).to.be.revertedWithCustomError(board, "WrongStatus");
    });
  });

  describe("reputation and ratings", function () {
    it("poster and worker rate each other once, updating reputation", async function () {
      const { board, alice, bob, taskId } = await loadFixture(completedFixture);
      await expect(board.connect(alice).rateTask(taskId, 5, "great work"))
        .to.emit(board, "RatingSubmitted")
        .withArgs(taskId, alice.address, bob.address, 5, "great work");
      await expect(board.connect(bob).rateTask(taskId, 4, "clear brief"))
        .to.emit(board, "RatingSubmitted")
        .withArgs(taskId, bob.address, alice.address, 4, "clear brief");
      expect(await board.averageRating(bob.address)).to.equal(500n);
      expect(await board.averageRating(alice.address)).to.equal(400n);
      const t = await board.getTask(taskId);
      expect(t.posterRated).to.equal(true);
      expect(t.workerRated).to.equal(true);
      await expect(board.connect(alice).rateTask(taskId, 1, "")).to.be.revertedWithCustomError(board, "AlreadyRated");
      await expect(board.connect(bob).rateTask(taskId, 1, "")).to.be.revertedWithCustomError(board, "AlreadyRated");
    });

    it("averages over multiple tasks", async function () {
      const { board, alice, bob, taskId } = await loadFixture(completedFixture);
      await board.connect(alice).rateTask(taskId, 5, "");
      const deadline = await deadlineIn(ONE_DAY);
      await board.connect(alice).postTask("second", "", deadline, { value: REWARD });
      await board.connect(bob).acceptTask(1);
      await board.connect(bob).completeTask(1, "done");
      await board.connect(alice).confirmCompletion(1);
      await board.connect(alice).rateTask(1, 2, "");
      expect(await board.averageRating(bob.address)).to.equal(350n);
      const w = await board.getAgent(bob.address);
      expect(w.ratingCount).to.equal(2n);
      expect(w.tasksCompleted).to.equal(2n);
      expect(w.earned).to.equal(2n * REWARD);
    });

    it("rejects scores outside 1-5, outsiders, unfinished tasks and long comments", async function () {
      const { board, alice, carol, taskId } = await loadFixture(completedFixture);
      await expect(board.connect(alice).rateTask(taskId, 0, "")).to.be.revertedWithCustomError(board, "InvalidScore");
      await expect(board.connect(alice).rateTask(taskId, 6, "")).to.be.revertedWithCustomError(board, "InvalidScore");
      await expect(board.connect(carol).rateTask(taskId, 5, "")).to.be.revertedWithCustomError(board, "NotWorker");
      await expect(board.connect(alice).rateTask(taskId, 5, "x".repeat(281))).to.be.revertedWithCustomError(
        board,
        "InvalidInput",
      );
      const deadline = await deadlineIn(ONE_DAY);
      await board.connect(alice).postTask("open", "", deadline, { value: REWARD });
      await expect(board.connect(alice).rateTask(1, 5, "")).to.be.revertedWithCustomError(board, "WrongStatus");
    });

    it("averageRating is 0 for unrated agents", async function () {
      const { board, carol } = await loadFixture(registeredFixture);
      expect(await board.averageRating(carol.address)).to.equal(0n);
    });
  });

  describe("owner permissions", function () {
    it("only the owner can pause", async function () {
      const { board, alice } = await loadFixture(registeredFixture);
      await expect(board.connect(alice).setPaused(true)).to.be.revertedWithCustomError(
        board,
        "OwnableUnauthorizedAccount",
      );
    });

    it("pause blocks only new activity; escrow exits keep working", async function () {
      const { board, owner, alice, bob, carol, agentId, outsider } = await loadFixture(registeredFixture);
      const deadline = await deadlineIn(7 * ONE_DAY);
      await board.connect(alice).postTask("a", "", deadline, { value: REWARD }); // 0
      await board.connect(alice).postTask("b", "", deadline, { value: REWARD }); // 1
      await board.connect(bob).acceptTask(0);
      await expect(board.connect(owner).setPaused(true)).to.emit(board, "PausedSet").withArgs(true);

      await agentId.mint(outsider.address);
      await expect(board.connect(outsider).registerAgent("late.ai")).to.be.revertedWithCustomError(board, "IsPaused");
      await expect(
        board.connect(alice).postTask("c", "", deadline, { value: REWARD }),
      ).to.be.revertedWithCustomError(board, "IsPaused");
      await expect(board.connect(carol).acceptTask(1)).to.be.revertedWithCustomError(board, "IsPaused");

      await board.connect(bob).completeTask(0, "done");
      await expect(board.connect(alice).confirmCompletion(0)).to.changeEtherBalance(bob, REWARD);
      await board.connect(alice).rateTask(0, 5, "");
      await expect(board.connect(alice).cancelTask(1)).to.changeEtherBalance(alice, REWARD);

      await board.connect(owner).setPaused(false);
      await board.connect(outsider).registerAgent("late.ai");
    });

    it("the owner has no way to take escrowed BNB", async function () {
      const { board, owner } = await loadFixture(postedFixture);
      const fragments = board.interface.fragments
        .filter((f) => f.type === "function")
        .map((f) => (f as any).name as string)
        .filter((n) => !(board.interface.getFunction(n)!.constant));
      expect(fragments.sort()).to.deep.equal(
        [
          "acceptTask",
          "cancelTask",
          "claimPayment",
          "completeTask",
          "confirmCompletion",
          "postTask",
          "rateTask",
          "registerAgent",
          "renounceOwnership",
          "requestRevision",
          "setPaused",
          "transferOwnership",
          "withdrawFromTask",
        ].sort(),
      );
      await expect(owner.sendTransaction({ to: await board.getAddress(), value: 1n })).to.be.reverted;
    });

    it("ownership can be renounced", async function () {
      const { board, owner } = await loadFixture(deployFixture);
      await board.connect(owner).renounceOwnership();
      expect(await board.owner()).to.equal(ethers.ZeroAddress);
    });
  });

  describe("full lifecycle across several agents", function () {
    it("keeps balances and counters consistent", async function () {
      const { board, alice, bob, carol } = await loadFixture(registeredFixture);
      const deadline = await deadlineIn(7 * ONE_DAY);
      const r1 = ethers.parseEther("0.01");
      const r2 = ethers.parseEther("0.02");
      const r3 = ethers.parseEther("0.03");
      await board.connect(alice).postTask("t0", "", deadline, { value: r1 });
      await board.connect(bob).postTask("t1", "", deadline, { value: r2 });
      await board.connect(carol).postTask("t2", "", deadline, { value: r3 });
      await board.connect(bob).acceptTask(0);
      await board.connect(carol).acceptTask(1);
      await board.connect(bob).completeTask(0, "r0");
      await board.connect(carol).completeTask(1, "r1");
      await board.connect(alice).confirmCompletion(0);
      await board.connect(bob).confirmCompletion(1);
      await board.connect(carol).cancelTask(2);
      expect(await board.totalEscrowed()).to.equal(0n);
      expect(await board.totalPaidOut()).to.equal(r1 + r2);
      expect(await board.totalCompleted()).to.equal(2n);
      expect(await ethers.provider.getBalance(await board.getAddress())).to.equal(0n);
      expect((await board.getAgent(bob.address)).earned).to.equal(r1);
      expect((await board.getAgent(bob.address)).spent).to.equal(r2);
      expect((await board.getAgent(carol.address)).earned).to.equal(r2);
    });
  });
});
