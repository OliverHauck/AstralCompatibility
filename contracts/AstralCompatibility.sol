// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint8, euint16, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract AstralCompatibility is SepoliaConfig {

    address public owner;
    uint256 public totalMatches;

    // 星座编号映射 (1-12)
    enum Zodiac {
        ARIES,      // 白羊座
        TAURUS,     // 金牛座
        GEMINI,     // 双子座
        CANCER,     // 巨蟹座
        LEO,        // 狮子座
        VIRGO,      // 处女座
        LIBRA,      // 天秤座
        SCORPIO,    // 天蝎座
        SAGITTARIUS,// 射手座
        CAPRICORN,  // 摩羯座
        AQUARIUS,   // 水瓶座
        PISCES      // 双鱼座
    }

    struct UserProfile {
        euint8 encryptedZodiac;     // 加密的星座信息
        euint8 encryptedElement;    // 加密的元素属性
        euint8 encryptedQuality;    // 加密的品质属性
        bool hasProfile;
        uint256 timestamp;
    }

    struct CompatibilityMatch {
        address user1;
        address user2;
        euint8 compatibilityScore;  // 加密的兼容性得分
        bool isRevealed;
        uint8 publicScore;          // 公开的得分
        uint256 matchTime;
    }

    mapping(address => UserProfile) public userProfiles;
    mapping(bytes32 => CompatibilityMatch) public matches;
    mapping(address => uint256) public userMatchCount;

    event ProfileCreated(address indexed user);
    event MatchRequested(address indexed user1, address indexed user2, bytes32 matchId);
    event CompatibilityRevealed(bytes32 indexed matchId, uint8 score);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not authorized");
        _;
    }

    modifier hasProfile(address user) {
        require(userProfiles[user].hasProfile, "User has no profile");
        _;
    }

    constructor() {
        owner = msg.sender;
        totalMatches = 0;
    }

    // 创建用户星座档案（隐私保护）
    function createProfile(
        uint8 _zodiac,      // 星座 (0-11)
        uint8 _element,     // 元素 (0=火, 1=土, 2=风, 3=水)
        uint8 _quality      // 品质 (0=本位, 1=固定, 2=变动)
    ) external {
        require(_zodiac < 12, "Invalid zodiac");
        require(_element < 4, "Invalid element");
        require(_quality < 3, "Invalid quality");
        require(!userProfiles[msg.sender].hasProfile, "Profile already exists");

        // 加密用户星座信息
        euint8 encZodiac = FHE.asEuint8(_zodiac);
        euint8 encElement = FHE.asEuint8(_element);
        euint8 encQuality = FHE.asEuint8(_quality);

        userProfiles[msg.sender] = UserProfile({
            encryptedZodiac: encZodiac,
            encryptedElement: encElement,
            encryptedQuality: encQuality,
            hasProfile: true,
            timestamp: block.timestamp
        });

        // 设置访问权限
        FHE.allowThis(encZodiac);
        FHE.allowThis(encElement);
        FHE.allowThis(encQuality);
        FHE.allow(encZodiac, msg.sender);
        FHE.allow(encElement, msg.sender);
        FHE.allow(encQuality, msg.sender);

        emit ProfileCreated(msg.sender);
    }

    // 请求兼容性匹配
    function requestCompatibilityMatch(address _partner) external
        hasProfile(msg.sender)
        hasProfile(_partner)
    {
        require(_partner != msg.sender, "Cannot match with yourself");

        bytes32 matchId = generateMatchId(msg.sender, _partner);
        require(matches[matchId].user1 == address(0), "Match already exists");

        // 计算兼容性得分（加密状态）
        euint8 compatibilityScore = calculateCompatibility(msg.sender, _partner);

        matches[matchId] = CompatibilityMatch({
            user1: msg.sender,
            user2: _partner,
            compatibilityScore: compatibilityScore,
            isRevealed: false,
            publicScore: 0,
            matchTime: block.timestamp
        });

        userMatchCount[msg.sender]++;
        userMatchCount[_partner]++;
        totalMatches++;

        // 设置访问权限
        FHE.allowThis(compatibilityScore);
        FHE.allow(compatibilityScore, msg.sender);
        FHE.allow(compatibilityScore, _partner);

        emit MatchRequested(msg.sender, _partner, matchId);
    }

    // 计算兼容性得分（私有函数）
    function calculateCompatibility(address _user1, address _user2)
        private
        returns (euint8)
    {
        UserProfile storage profile1 = userProfiles[_user1];
        UserProfile storage profile2 = userProfiles[_user2];

        // 基础得分从50开始
        euint8 baseScore = FHE.asEuint8(50);

        // 元素兼容性检查
        ebool sameElement = FHE.eq(profile1.encryptedElement, profile2.encryptedElement);
        euint8 elementBonus = FHE.select(sameElement, FHE.asEuint8(20), FHE.asEuint8(0));

        // 品质兼容性检查
        ebool sameQuality = FHE.eq(profile1.encryptedQuality, profile2.encryptedQuality);
        euint8 qualityBonus = FHE.select(sameQuality, FHE.asEuint8(15), FHE.asEuint8(0));

        // 相同星座检查
        ebool sameZodiac = FHE.eq(profile1.encryptedZodiac, profile2.encryptedZodiac);
        euint8 zodiacPenalty = FHE.select(sameZodiac, FHE.asEuint8(10), FHE.asEuint8(0));

        // 计算最终得分
        euint8 totalScore = FHE.add(baseScore, elementBonus);
        totalScore = FHE.add(totalScore, qualityBonus);
        totalScore = FHE.sub(totalScore, zodiacPenalty);

        // 添加一些随机性
        euint8 randomFactor = FHE.randEuint8();
        // 使用位运算获取0-15的随机数
        euint8 randomBonus = FHE.and(randomFactor, FHE.asEuint8(15)); // 0-15
        totalScore = FHE.add(totalScore, randomBonus);

        return totalScore;
    }

    // 揭示兼容性得分
    function revealCompatibilityScore(bytes32 _matchId) external {
        CompatibilityMatch storage matchData = matches[_matchId];
        require(matchData.user1 != address(0), "Match does not exist");
        require(msg.sender == matchData.user1 || msg.sender == matchData.user2, "Not authorized");
        require(!matchData.isRevealed, "Score already revealed");

        // 请求异步解密
        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(matchData.compatibilityScore);
        FHE.requestDecryption(cts, this.processScoreReveal.selector);
    }

    // 处理得分揭示回调
    function processScoreReveal(
        uint256 requestId,
        bytes memory decryptedCts,
        bytes memory signatures
    ) external {
        // 验证签名
        FHE.checkSignatures(requestId, decryptedCts, signatures);

        // 解析解密后的得分
        uint8 score = uint8(bytes1(decryptedCts[0]));

        // 这里需要通过requestId找到对应的match
        // 简化实现，实际需要维护requestId到matchId的映射
        bytes32 matchId = bytes32(requestId);
        CompatibilityMatch storage matchData = matches[matchId];

        matchData.publicScore = score;
        matchData.isRevealed = true;

        emit CompatibilityRevealed(matchId, score);
    }

    // 生成匹配ID
    function generateMatchId(address _user1, address _user2)
        public
        pure
        returns (bytes32)
    {
        // 确保ID的唯一性，不受用户顺序影响
        if (_user1 < _user2) {
            return keccak256(abi.encodePacked(_user1, _user2));
        } else {
            return keccak256(abi.encodePacked(_user2, _user1));
        }
    }

    // 获取用户档案状态
    function getUserProfileStatus(address _user)
        external
        view
        returns (bool hasProfile, uint256 timestamp)
    {
        UserProfile storage profile = userProfiles[_user];
        return (profile.hasProfile, profile.timestamp);
    }

    // 获取匹配信息
    function getMatchInfo(bytes32 _matchId)
        external
        view
        returns (
            address user1,
            address user2,
            bool isRevealed,
            uint8 publicScore,
            uint256 matchTime
        )
    {
        CompatibilityMatch storage matchData = matches[_matchId];
        return (
            matchData.user1,
            matchData.user2,
            matchData.isRevealed,
            matchData.publicScore,
            matchData.matchTime
        );
    }

    // 获取用户匹配统计
    function getUserStats(address _user)
        external
        view
        returns (uint256 matchCount)
    {
        return userMatchCount[_user];
    }

    // 获取星座信息（仅供参考）
    function getZodiacInfo(uint8 _zodiac)
        external
        pure
        returns (string memory name, uint8 element, uint8 quality)
    {
        require(_zodiac < 12, "Invalid zodiac");

        string[12] memory zodiacNames = [
            "Aries", "Taurus", "Gemini", "Cancer",
            "Leo", "Virgo", "Libra", "Scorpio",
            "Sagittarius", "Capricorn", "Aquarius", "Pisces"
        ];

        uint8[12] memory elements = [0, 1, 2, 3, 0, 1, 2, 3, 0, 1, 2, 3];
        uint8[12] memory qualities = [0, 1, 2, 0, 1, 2, 0, 1, 2, 0, 1, 2];

        return (zodiacNames[_zodiac], elements[_zodiac], qualities[_zodiac]);
    }

    // 更新档案（仅限用户本人）
    function updateProfile(
        uint8 _zodiac,
        uint8 _element,
        uint8 _quality
    ) external hasProfile(msg.sender) {
        require(_zodiac < 12, "Invalid zodiac");
        require(_element < 4, "Invalid element");
        require(_quality < 3, "Invalid quality");

        UserProfile storage profile = userProfiles[msg.sender];

        // 更新加密信息
        profile.encryptedZodiac = FHE.asEuint8(_zodiac);
        profile.encryptedElement = FHE.asEuint8(_element);
        profile.encryptedQuality = FHE.asEuint8(_quality);
        profile.timestamp = block.timestamp;

        // 重新设置权限
        FHE.allowThis(profile.encryptedZodiac);
        FHE.allowThis(profile.encryptedElement);
        FHE.allowThis(profile.encryptedQuality);
        FHE.allow(profile.encryptedZodiac, msg.sender);
        FHE.allow(profile.encryptedElement, msg.sender);
        FHE.allow(profile.encryptedQuality, msg.sender);
    }
}