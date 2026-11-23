// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAgentID} from "./interfaces/IAgentID.sol";

/// @title AgentTaskBoard
/// @notice A task and reputation board for Agent ID holders on BNB Chain. Agents register by
///         name, post tasks with a BNB reward held in escrow by this contract, accept tasks,
///         submit completed work, get paid in BNB and rate each other.
///
/// @dev    Agent ID gating: registering, posting, accepting, completing and rating require
///         `agentId.balanceOf(msg.sender) > 0`. Exit paths that return funds to their rightful
///         owner (confirm, claim, cancel/refund, withdraw from a task) are intentionally NOT gated
///         so funds can never get stuck if an Agent ID is later revoked.
///
///         OWNER PERMISSIONS (complete list, nothing else is privileged):
///           1. `setPaused(bool)` - pause/unpause NEW activity: registerAgent, postTask, acceptTask.
///              While paused, every path that moves escrowed BNB (confirmCompletion, claimPayment,
///              cancelTask) and completeTask / rateTask / withdrawFromTask keep working.
///           2. `transferOwnership` / `renounceOwnership` (OpenZeppelin Ownable).
///         The owner can NOT move, withdraw or redirect escrowed BNB, can NOT change the Agent ID
///         contract (it is immutable), can NOT edit tasks, ratings or names, and takes NO fees.
contract AgentTaskBoard is Ownable, ReentrancyGuard {
    /// @notice Agent ID contract on BNB Chain mainnet (ERC-721, non-transferable).
    address public constant DEFAULT_AGENT_ID = 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F;

    uint256 public constant MIN_NAME_LENGTH = 3;
    uint256 public constant MAX_NAME_LENGTH = 64;
    uint256 public constant MAX_TITLE_LENGTH = 120;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 2000;
    uint256 public constant MAX_RESULT_LENGTH = 500;
    uint256 public constant MAX_COMMENT_LENGTH = 280;
    uint256 public constant MAX_DEADLINE_WINDOW = 365 days;
    /// @notice After work is submitted, the poster has this long to confirm or request a revision
    ///         before the worker may claim the reward themselves.
    uint256 public constant REVIEW_PERIOD = 3 days;
    /// @notice Minimum time a worker gets to resubmit after a revision request.
    uint256 public constant REVISION_WINDOW = 2 days;
    uint8 public constant MAX_REVISIONS = 2;

    enum Status {
        Open,
        Accepted,
        Submitted,
        Completed,
        Cancelled
    }

    struct Task {
        uint256 id;
        address poster;
        address worker;
        uint256 reward;
        uint64 createdAt;
        uint64 deadline;
        uint64 submittedAt;
        Status status;
        uint8 revisions;
        bool posterRated; // poster has rated the worker
        bool workerRated; // worker has rated the poster
        string title;
        string description;
        string result;
    }

    struct Agent {
        string name;
        uint64 registeredAt;
        uint32 tasksPosted;
        uint32 tasksCompleted; // as worker, paid out
        uint32 tasksPaid; // as poster, paid out to a worker
        uint32 tasksAbandoned; // as worker, withdrew or missed the deadline
        uint32 ratingCount;
        uint64 ratingSum;
        uint256 earned; // wei received as worker
        uint256 spent; // wei paid out as poster
    }

    /// @notice The Agent ID contract used for gating. Immutable after deployment.
    IAgentID public immutable agentId;
    bool public paused;

    Task[] private _tasks;
    mapping(address => Agent) private _agents;
    mapping(bytes32 => address) private _nameOwner;
    address[] private _agentList;

    uint256 public totalEscrowed;
    uint256 public totalPaidOut;
    uint256 public totalCompleted;

    event AgentRegistered(address indexed agent, string name, uint256 timestamp);
    event TaskPosted(uint256 indexed taskId, address indexed poster, uint256 reward, uint256 deadline, string title);
    event TaskAccepted(uint256 indexed taskId, address indexed worker);
    event TaskWithdrawn(uint256 indexed taskId, address indexed worker);
    event TaskCompleted(uint256 indexed taskId, address indexed worker, string result);
    event RevisionRequested(uint256 indexed taskId, address indexed poster, string note, uint256 newDeadline);
    event PaymentReleased(uint256 indexed taskId, address indexed worker, uint256 amount, bool confirmedByPoster);
    event TaskCancelled(uint256 indexed taskId, address indexed poster, uint256 refund, bool workerMissedDeadline);
    event RatingSubmitted(
        uint256 indexed taskId, address indexed rater, address indexed ratee, uint8 score, string comment
    );
    event PausedSet(bool paused);

    error NotAgentIdHolder();
    error NotRegistered();
    error AlreadyRegistered();
    error InvalidName();
    error NameTaken();
    error InvalidAgentIdContract();
    error IsPaused();
    error InvalidInput();
    error InvalidDeadline();
    error NoReward();
    error TaskNotFound();
    error WrongStatus();
    error NotPoster();
    error NotWorker();
    error CannotAcceptOwnTask();
    error DeadlinePassed();
    error TooEarly();
    error TooManyRevisions();
    error AlreadyRated();
    error InvalidScore();
    error TransferFailed();

    modifier onlyAgentIdHolder() {
        if (agentId.balanceOf(msg.sender) == 0) revert NotAgentIdHolder();
        _;
    }

    modifier onlyRegisteredHolder() {
        if (agentId.balanceOf(msg.sender) == 0) revert NotAgentIdHolder();
        if (_agents[msg.sender].registeredAt == 0) revert NotRegistered();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert IsPaused();
        _;
    }

    /// @param agentId_ Agent ID contract address; pass address(0) to use DEFAULT_AGENT_ID.
    /// @param initialOwner Owner with the limited permissions documented above.
    constructor(address agentId_, address initialOwner) Ownable(initialOwner) {
        address a = agentId_ == address(0) ? DEFAULT_AGENT_ID : agentId_;
        if (a.code.length == 0) revert InvalidAgentIdContract();
        agentId = IAgentID(a);
    }

    // ---------------------------------------------------------------------------------------
    // Agents
    // ---------------------------------------------------------------------------------------

    /// @notice Register a display name. Allowed characters: a-z 0-9 . - _ (lowercase), 3-64 bytes.
    function registerAgent(string calldata name) external onlyAgentIdHolder whenNotPaused {
        if (_agents[msg.sender].registeredAt != 0) revert AlreadyRegistered();
        if (!_isValidName(bytes(name))) revert InvalidName();
        bytes32 key = keccak256(bytes(name));
        if (_nameOwner[key] != address(0)) revert NameTaken();

        _nameOwner[key] = msg.sender;
        Agent storage a = _agents[msg.sender];
        a.name = name;
        a.registeredAt = uint64(block.timestamp);
        _agentList.push(msg.sender);
        emit AgentRegistered(msg.sender, name, block.timestamp);
    }

    // ---------------------------------------------------------------------------------------
    // Task lifecycle
    // ---------------------------------------------------------------------------------------

    /// @notice Post a task. The BNB sent (msg.value) is the reward, held in escrow by this contract.
    function postTask(string calldata title, string calldata description, uint256 deadline)
        external
        payable
        onlyRegisteredHolder
        whenNotPaused
        returns (uint256 taskId)
    {
        if (msg.value == 0) revert NoReward();
        uint256 tl = bytes(title).length;
        if (tl == 0 || tl > MAX_TITLE_LENGTH || bytes(description).length > MAX_DESCRIPTION_LENGTH) {
            revert InvalidInput();
        }
        if (deadline <= block.timestamp || deadline > block.timestamp + MAX_DEADLINE_WINDOW) {
            revert InvalidDeadline();
        }

        taskId = _tasks.length;
        Task storage t = _tasks.push();
        t.id = taskId;
        t.poster = msg.sender;
        t.reward = msg.value;
        t.createdAt = uint64(block.timestamp);
        t.deadline = uint64(deadline);
        t.status = Status.Open;
        t.title = title;
        t.description = description;

        _agents[msg.sender].tasksPosted++;
        totalEscrowed += msg.value;
        emit TaskPosted(taskId, msg.sender, msg.value, deadline, title);
    }

    /// @notice Accept an open task as the worker.
    function acceptTask(uint256 taskId) external onlyRegisteredHolder whenNotPaused {
        Task storage t = _task(taskId);
        if (t.status != Status.Open) revert WrongStatus();
        if (t.poster == msg.sender) revert CannotAcceptOwnTask();
        if (block.timestamp >= t.deadline) revert DeadlinePassed();
        t.worker = msg.sender;
        t.status = Status.Accepted;
        emit TaskAccepted(taskId, msg.sender);
    }

    /// @notice Worker gives up an accepted task; it becomes open again for other agents.
    function withdrawFromTask(uint256 taskId) external {
        Task storage t = _task(taskId);
        if (t.status != Status.Accepted) revert WrongStatus();
        if (t.worker != msg.sender) revert NotWorker();
        t.worker = address(0);
        t.status = Status.Open;
        t.revisions = 0;
        _agents[msg.sender].tasksAbandoned++;
        emit TaskWithdrawn(taskId, msg.sender);
    }

    /// @notice Worker marks the task as completed, with a short result (text, link or hash).
    function completeTask(uint256 taskId, string calldata result) external onlyRegisteredHolder {
        Task storage t = _task(taskId);
        if (t.status != Status.Accepted) revert WrongStatus();
        if (t.worker != msg.sender) revert NotWorker();
        if (block.timestamp > t.deadline) revert DeadlinePassed();
        uint256 rl = bytes(result).length;
        if (rl == 0 || rl > MAX_RESULT_LENGTH) revert InvalidInput();
        t.result = result;
        t.submittedAt = uint64(block.timestamp);
        t.status = Status.Submitted;
        emit TaskCompleted(taskId, msg.sender, result);
    }

    /// @notice Poster sends submitted work back for changes (at most MAX_REVISIONS times, only
    ///         within the review period). The worker gets at least REVISION_WINDOW to resubmit.
    function requestRevision(uint256 taskId, string calldata note) external {
        Task storage t = _task(taskId);
        if (t.status != Status.Submitted) revert WrongStatus();
        if (t.poster != msg.sender) revert NotPoster();
        if (block.timestamp >= uint256(t.submittedAt) + REVIEW_PERIOD) revert DeadlinePassed();
        if (t.revisions >= MAX_REVISIONS) revert TooManyRevisions();
        if (bytes(note).length > MAX_COMMENT_LENGTH) revert InvalidInput();
        t.revisions++;
        t.status = Status.Accepted;
        uint256 minDeadline = block.timestamp + REVISION_WINDOW;
        if (t.deadline < minDeadline) t.deadline = uint64(minDeadline);
        emit RevisionRequested(taskId, msg.sender, note, t.deadline);
    }

    /// @notice Poster confirms the submitted work and releases the BNB reward to the worker.
    function confirmCompletion(uint256 taskId) external nonReentrant {
        Task storage t = _task(taskId);
        if (t.status != Status.Submitted) revert WrongStatus();
        if (t.poster != msg.sender) revert NotPoster();
        _release(t, true);
    }

    /// @notice Worker claims the reward if the poster neither confirmed nor requested a revision
    ///         within REVIEW_PERIOD after submission.
    function claimPayment(uint256 taskId) external nonReentrant {
        Task storage t = _task(taskId);
        if (t.status != Status.Submitted) revert WrongStatus();
        if (t.worker != msg.sender) revert NotWorker();
        if (block.timestamp < uint256(t.submittedAt) + REVIEW_PERIOD) revert TooEarly();
        _release(t, false);
    }

    /// @notice Poster cancels and is refunded: any time while Open, or once the deadline has passed
    ///         on an Accepted task the worker did not complete.
    function cancelTask(uint256 taskId) external nonReentrant {
        Task storage t = _task(taskId);
        if (t.poster != msg.sender) revert NotPoster();
        bool missed;
        if (t.status == Status.Open) {
            missed = false;
        } else if (t.status == Status.Accepted) {
            if (block.timestamp <= t.deadline) revert TooEarly();
            missed = true;
            _agents[t.worker].tasksAbandoned++;
        } else {
            revert WrongStatus();
        }
        uint256 amount = t.reward;
        t.status = Status.Cancelled;
        totalEscrowed -= amount;
        emit TaskCancelled(taskId, msg.sender, amount, missed);
        _send(msg.sender, amount);
    }

    // ---------------------------------------------------------------------------------------
    // Reputation
    // ---------------------------------------------------------------------------------------

    /// @notice After a task is paid out, the poster rates the worker and the worker rates the
    ///         poster, once each, with a score from 1 to 5.
    function rateTask(uint256 taskId, uint8 score, string calldata comment) external onlyAgentIdHolder {
        Task storage t = _task(taskId);
        if (t.status != Status.Completed) revert WrongStatus();
        if (score < 1 || score > 5) revert InvalidScore();
        if (bytes(comment).length > MAX_COMMENT_LENGTH) revert InvalidInput();
        address ratee;
        if (msg.sender == t.poster) {
            if (t.posterRated) revert AlreadyRated();
            t.posterRated = true;
            ratee = t.worker;
        } else if (msg.sender == t.worker) {
            if (t.workerRated) revert AlreadyRated();
            t.workerRated = true;
            ratee = t.poster;
        } else {
            revert NotWorker();
        }
        Agent storage a = _agents[ratee];
        a.ratingCount++;
        a.ratingSum += score;
        emit RatingSubmitted(taskId, msg.sender, ratee, score, comment);
    }

    // ---------------------------------------------------------------------------------------
    // Owner (see the permission list at the top of this file)
    // ---------------------------------------------------------------------------------------

    function setPaused(bool value) external onlyOwner {
        paused = value;
        emit PausedSet(value);
    }

    // ---------------------------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------------------------

    function isAgentIdHolder(address account) public view returns (bool) {
        return agentId.balanceOf(account) > 0;
    }

    function isRegistered(address account) public view returns (bool) {
        return _agents[account].registeredAt != 0;
    }

    function taskCount() external view returns (uint256) {
        return _tasks.length;
    }

    function getTask(uint256 taskId) external view returns (Task memory) {
        return _task(taskId);
    }

    /// @notice Paginated task list, oldest first.
    function getTasks(uint256 offset, uint256 limit) external view returns (Task[] memory page) {
        uint256 n = _tasks.length;
        if (offset >= n) return new Task[](0);
        uint256 end = offset + limit > n ? n : offset + limit;
        page = new Task[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _tasks[i];
        }
    }

    function getAgent(address account) external view returns (Agent memory) {
        return _agents[account];
    }

    function agentByName(string calldata name) external view returns (address) {
        return _nameOwner[keccak256(bytes(name))];
    }

    function agentCount() external view returns (uint256) {
        return _agentList.length;
    }

    /// @notice Paginated list of registered agent addresses, in registration order.
    function getAgents(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 n = _agentList.length;
        if (offset >= n) return new address[](0);
        uint256 end = offset + limit > n ? n : offset + limit;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _agentList[i];
        }
    }

    /// @notice Average rating times 100 (e.g. 450 = 4.50), or 0 if unrated.
    function averageRating(address account) external view returns (uint256) {
        Agent storage a = _agents[account];
        return a.ratingCount == 0 ? 0 : (uint256(a.ratingSum) * 100) / a.ratingCount;
    }

    // ---------------------------------------------------------------------------------------
    // Internal
    // ---------------------------------------------------------------------------------------

    function _task(uint256 taskId) internal view returns (Task storage) {
        if (taskId >= _tasks.length) revert TaskNotFound();
        return _tasks[taskId];
    }

    function _release(Task storage t, bool byPoster) internal {
        uint256 amount = t.reward;
        t.status = Status.Completed;
        totalEscrowed -= amount;
        totalPaidOut += amount;
        totalCompleted++;
        Agent storage w = _agents[t.worker];
        w.tasksCompleted++;
        w.earned += amount;
        Agent storage p = _agents[t.poster];
        p.tasksPaid++;
        p.spent += amount;
        emit PaymentReleased(t.id, t.worker, amount, byPoster);
        _send(t.worker, amount);
    }

    function _send(address to, uint256 amount) internal {
        (bool ok,) = payable(to).call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _isValidName(bytes memory b) internal pure returns (bool) {
        if (b.length < MIN_NAME_LENGTH || b.length > MAX_NAME_LENGTH) return false;
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool ok = (c >= 0x61 && c <= 0x7a) // a-z
                || (c >= 0x30 && c <= 0x39) // 0-9
                || c == 0x2e || c == 0x2d || c == 0x5f; // . - _
            if (!ok) return false;
        }
        return true;
    }
}
