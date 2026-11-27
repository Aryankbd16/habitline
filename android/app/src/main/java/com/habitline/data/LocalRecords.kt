package com.habitline.data

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "profiles"
)
data class LocalProfile(
    @PrimaryKey val id: String,
    val displayName: String,
    val createdAt: String,
    val accountId: String? = null
)

@Entity(
    tableName = "habits",
    foreignKeys = [
        ForeignKey(entity = LocalProfile::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)
    ],
    indices = [Index("profileId")]
)
data class LocalHabit(
    @PrimaryKey val id: String,
    val profileId: String,
    val name: String,
    val icon: String,
    val createdAt: String,
    val updatedAt: String,
    val description: String = "",
    val category: String = "General",
    val priority: String = "medium",
    val difficulty: String? = null,
    val xpValue: Int = 10,
    val reminderTime: String? = null
)

@Entity(
    tableName = "schedule_revisions",
    foreignKeys = [
        ForeignKey(entity = LocalHabit::class, parentColumns = ["id"], childColumns = ["habitId"], onDelete = ForeignKey.CASCADE)
    ],
    indices = [Index(value = ["habitId", "effectiveFrom"], unique = true)]
)
data class ScheduleRevision(
    @PrimaryKey val id: String,
    val habitId: String,
    val effectiveFrom: String,
    val startDate: String,
    val weekdayMask: Int,
    val points: Double,
    val archived: Boolean = false
)

@Entity(
    tableName = "completions",
    foreignKeys = [
        ForeignKey(entity = LocalHabit::class, parentColumns = ["id"], childColumns = ["habitId"], onDelete = ForeignKey.CASCADE)
    ],
    indices = [Index(value = ["habitId", "day"], unique = true)]
)
data class HabitCompletion(
    @PrimaryKey val id: String,
    val habitId: String,
    val day: String,
    val completedAt: String?,
    val pointsEarned: Double,
    val xpEarned: Int?
)

@Entity(
    tableName = "widget_bindings",
    foreignKeys = [
        ForeignKey(entity = LocalHabit::class, parentColumns = ["id"], childColumns = ["habitId"], onDelete = ForeignKey.CASCADE)
    ],
    indices = [Index("habitId")]
)
data class WidgetBinding(
    @PrimaryKey val widgetId: Int,
    val habitId: String
)

@Entity(
    tableName = "storage_migrations",
    foreignKeys = [
        ForeignKey(entity = LocalProfile::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)
    ],
    indices = [Index("profileId")]
)
data class StorageMigration(
    @PrimaryKey val source: String,
    val profileId: String,
    val migratedAt: String,
    val sourceSha256: String?
)

@Entity(
    tableName = "xp_events",
    foreignKeys = [
        ForeignKey(entity = LocalProfile::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)
    ],
    indices = [Index("profileId"), Index(value = ["completionId", "kind"], unique = true), Index(value = ["habitId", "day"])]
)
data class XpEvent(
    @PrimaryKey val id: String,
    val profileId: String,
    val completionId: String,
    val habitId: String,
    val day: String,
    val kind: String,
    val amount: Int,
    val at: String
)

@Entity(
    tableName = "habit_relationships",
    foreignKeys = [
        ForeignKey(entity = LocalHabit::class, parentColumns = ["id"], childColumns = ["habitId"], onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = LocalHabit::class, parentColumns = ["id"], childColumns = ["relatedHabitId"], onDelete = ForeignKey.CASCADE)
    ],
    indices = [Index(value = ["habitId", "relatedHabitId"], unique = true), Index("relatedHabitId")]
)
data class HabitLink(
    @PrimaryKey val id: String,
    val habitId: String,
    val relatedHabitId: String,
    val kind: String
)

@Entity(
    tableName = "goals",
    foreignKeys = [
        ForeignKey(entity = LocalProfile::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)
    ],
    indices = [Index("profileId")]
)
data class LocalGoal(
    @PrimaryKey val id: String,
    val profileId: String,
    val title: String,
    val description: String,
    val target: Int,
    val startDate: String,
    val targetDate: String?,
    val archivedOn: String?
)

@Entity(
    tableName = "goal_habits",
    foreignKeys = [
        ForeignKey(entity = LocalGoal::class, parentColumns = ["id"], childColumns = ["goalId"], onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = LocalHabit::class, parentColumns = ["id"], childColumns = ["habitId"], onDelete = ForeignKey.CASCADE)
    ],
    indices = [Index(value = ["goalId", "habitId"], unique = true), Index("habitId")]
)
data class GoalHabit(
    @PrimaryKey val id: String,
    val goalId: String,
    val habitId: String
)

@Entity(
    tableName = "milestones",
    foreignKeys = [
        ForeignKey(entity = LocalProfile::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)
    ],
    indices = [Index(value = ["profileId", "kind", "subjectId"], unique = true)]
)
data class Milestone(
    @PrimaryKey val id: String,
    val profileId: String,
    val kind: String,
    val subjectId: String,
    val title: String,
    val description: String,
    val earnedOn: String
)

@Entity(
    tableName = "challenges",
    foreignKeys = [
        ForeignKey(entity = LocalProfile::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)
    ],
    indices = [Index("profileId")]
)
data class PersonalChallenge(
    @PrimaryKey val id: String,
    val profileId: String,
    val title: String,
    val description: String,
    val kind: String,
    val target: Int,
    val startDate: String,
    val endDate: String,
    val archivedOn: String?
)

@Entity(
    tableName = "challenge_habits",
    foreignKeys = [
        ForeignKey(entity = PersonalChallenge::class, parentColumns = ["id"], childColumns = ["challengeId"], onDelete = ForeignKey.CASCADE),
        ForeignKey(entity = LocalHabit::class, parentColumns = ["id"], childColumns = ["habitId"], onDelete = ForeignKey.CASCADE)
    ],
    indices = [Index(value = ["challengeId", "habitId"], unique = true), Index("habitId")]
)
data class ChallengeHabit(
    @PrimaryKey val id: String,
    val challengeId: String,
    val habitId: String
)

@Entity(
    tableName = "preferences",
    foreignKeys = [
        ForeignKey(entity = LocalProfile::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)
    ],
    indices = [Index(value = ["profileId", "key"], unique = true)]
)
data class ProfilePreference(
    @PrimaryKey val id: String,
    val profileId: String,
    val key: String,
    val value: String
)

@Entity(
    tableName = "social_cache",
    foreignKeys = [
        ForeignKey(entity = LocalProfile::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)
    ],
    indices = [Index(value = ["profileId", "resource"], unique = true)]
)
data class SocialCacheEntry(
    @PrimaryKey val id: String,
    val profileId: String,
    val resource: String,
    val payload: String,
    val fetchedAt: String
)

@Entity(
    tableName = "outbox",
    foreignKeys = [
        ForeignKey(entity = LocalProfile::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)
    ],
    indices = [Index("profileId")]
)
data class PendingMutation(
    @PrimaryKey val id: String,
    val profileId: String,
    val entity: String,
    val entityId: String,
    val operation: String,
    val payload: String,
    val createdAt: String
)

@Entity(
    tableName = "tombstones",
    foreignKeys = [
        ForeignKey(entity = LocalProfile::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)
    ],
    indices = [Index(value = ["profileId", "entity", "entityId"], unique = true)]
)
data class Deletion(
    @PrimaryKey val id: String,
    val profileId: String,
    val entity: String,
    val entityId: String,
    val deletedAt: String
)

@Entity(
    tableName = "sync_cursors",
    foreignKeys = [
        ForeignKey(entity = LocalProfile::class, parentColumns = ["id"], childColumns = ["profileId"], onDelete = ForeignKey.CASCADE)
    ],
    indices = [Index(value = ["profileId", "peerId"], unique = true)]
)
data class SyncCursor(
    @PrimaryKey val id: String,
    val profileId: String,
    val peerId: String,
    val sequence: Long,
    val lastSuccessAt: String?
)
