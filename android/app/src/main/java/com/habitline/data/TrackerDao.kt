package com.habitline.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface TrackerDao {
    @Query("SELECT * FROM storage_migrations WHERE source = 'shared-prefs-v1'")
    fun migration(): StorageMigration?

    @Query("SELECT * FROM habits ORDER BY createdAt, id")
    fun habits(): List<LocalHabit>

    @Query("SELECT * FROM habits WHERE id = :id")
    fun habit(id: String): LocalHabit?

    @Query("SELECT * FROM schedule_revisions ORDER BY effectiveFrom")
    fun revisions(): List<ScheduleRevision>

    @Query("SELECT * FROM schedule_revisions WHERE habitId = :id AND effectiveFrom <= :day ORDER BY effectiveFrom DESC LIMIT 1")
    fun schedule(id: String, day: String): ScheduleRevision?

    @Query("SELECT * FROM completions ORDER BY day, id")
    fun completions(): List<HabitCompletion>

    @Query("SELECT * FROM completions WHERE habitId = :id AND day = :day")
    fun completion(id: String, day: String): HabitCompletion?

    @Query("SELECT * FROM completions WHERE habitId = :id")
    fun habitCompletions(id: String): List<HabitCompletion>

    @Query("SELECT * FROM widget_bindings")
    fun widgets(): List<WidgetBinding>

    @Query("SELECT habitId FROM widget_bindings WHERE widgetId = :widgetId")
    fun boundHabit(widgetId: Int): String?

    @Query("SELECT amount FROM xp_events WHERE habitId = :id AND day = :day AND kind = 'award' ORDER BY rowid LIMIT 1")
    fun firstAward(id: String, day: String): Int?

    @Query("SELECT EXISTS(SELECT 1 FROM profiles)")
    fun hasProfile(): Boolean

    @Query("SELECT (SELECT count(*) FROM habits) + (SELECT count(*) FROM completions) + (SELECT count(*) FROM schedule_revisions)")
    fun observeTracker(): Flow<Long>

    @Insert fun insert(profile: LocalProfile)
    @Insert fun insert(habit: LocalHabit)
    @Insert fun insert(revision: ScheduleRevision)
    @Insert fun insert(completion: HabitCompletion)
    @Insert fun insert(binding: WidgetBinding)
    @Insert fun insert(marker: StorageMigration)
    @Insert fun insert(event: XpEvent)
    @Insert fun insert(mutation: PendingMutation)
    @Insert fun insert(tombstone: Deletion)
    @Upsert fun bind(binding: WidgetBinding)

    @Query("DELETE FROM habits WHERE id = :id") fun deleteHabit(id: String)
    @Query("DELETE FROM completions WHERE id = :id") fun deleteCompletion(id: String)
    @Query("DELETE FROM widget_bindings WHERE widgetId = :id") fun clearWidget(id: Int)
}
